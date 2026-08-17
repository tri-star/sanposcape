import { useRouter, useSegments } from "expo-router";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

import { useAuthSessionBootstrap } from "@/features/auth/hooks/useAuthSessionBootstrap";
import {
  isPublicRoute,
  resolveAuthGateDecision,
  shouldEvacuateOnSessionEnd,
} from "@/features/auth/lib/authGate";
import type { AuthGateRedirectHref } from "@/features/auth/lib/authGate";
import type { AuthSessionStatus } from "@/store/useAuthSessionStore";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

type AuthGateProps = { children: ReactNode };

/**
 * 「可能なら履歴スタックを破棄してから置き換える」処理を1箇所にまとめるヘルパー。
 * ゲート判定による redirect（下記 effect 1）とセッション終了時の退避（下記 effect 2）の
 * どちらも同じ `dismissAll()` → `replace()` の手順を踏むため、重複を避けるために括り出した
 * （SS-57 ローカルレビュー対応）。
 */
function dismissAllAndReplace(
  router: ReturnType<typeof useRouter>,
  href: AuthGateRedirectHref,
): void {
  if (router.canDismiss()) {
    router.dismissAll();
  }
  router.replace(href);
}

/**
 * 「起動時のセッション復元の起動」と「ゲート判定に基づく遷移」を担う、UI を持たないコンポーネント。
 * `app/_layout.tsx` が `<Stack>` を包む形で1箇所だけ配置する（SS-13 / ADR-009）。
 *
 * 重要な注意:
 * - **`useEffect` の依存に `segments`（配列）を直接入れない**。`useSegments()` の戻り値は
 *   レンダーごとに同一性が変わりうるため、redirect 中に effect が毎レンダー発火して
 *   `router.replace` を連打しうる。`redirectHref`（`string | null`）を依存にすることで
 *   発火は1回に収まる。
 * - **`children` を条件付きで差し替えない**（`{status === "loading" ? null : children}` のような
 *   分岐は禁止）。`<Stack>` がアンマウントされ、ナビゲータが再生成されて遷移が壊れる。
 * - ナビゲーションは effect の中でのみ行う。`AuthGate` は `<Stack>` の親なので、
 *   子（`<Stack>`）のマウント完了後に effect が走る＝
 *   「Attempted to navigate before mounting the Root Layout」は発生しない。
 * - **レンダリングテストは書けない**（`vitest.config.ts` が node 環境 + `react-native` スタブのため）。
 *   判定は `lib/authGate.ts` に切り出してあるので、テストはそちらで担保する。
 * - `authenticated → guest` **の遷移**（サインアウト / refresh token 失効）で保護ルートから退避し、
 *   履歴スタックを破棄するのはここだけが担う（SS-50 / SS-57）。SS-57 で guest 自体は保護ルートに
 *   入れるようになったため、退避条件は「guest かどうか」ではなく「authenticated から guest へ
 *   落ちたかどうか」（`shouldEvacuateOnSessionEnd`）に変わった。`dismissAll()` は呼べる場合だけ
 *   実行し、その後にサインイン画面へ置き換える。これにより、設定画面側の Promise callback と
 *   React effect の実行順へ依存しない。
 */
export function AuthGate({ children }: AuthGateProps) {
  const router = useRouter();
  const segments = useSegments();
  const status = useAuthSessionStore((state) => state.status);

  useAuthSessionBootstrap();

  const decision = resolveAuthGateDecision({ status, segments });
  // 依存配列に string | null を置く（segments 配列の同一性に依存させない）。
  const redirectHref = decision.type === "redirect" ? decision.href : null;

  useEffect(() => {
    if (redirectHref === null) return;
    dismissAllAndReplace(router, redirectHref);
  }, [redirectHref, router]);

  // 依存配列には boolean（isPublicRoute の結果）を置く（segments 配列の同一性に依存させない）。
  const publicRoute = isPublicRoute(segments);
  const previousStatusRef = useRef<AuthSessionStatus>(status);

  useEffect(() => {
    // 前回 status は ref で持ち、effect の中で読んで即更新する（レンダー中にミューテートしない）。
    // ルート変更で effect が再実行されても、ref は既に現在の status に更新済みなので二重退避しない。
    const previousStatus = previousStatusRef.current;
    previousStatusRef.current = status;
    if (!shouldEvacuateOnSessionEnd({ previousStatus, status, isPublicRoute: publicRoute })) {
      return;
    }
    dismissAllAndReplace(router, "/(auth)/sign-in");
  }, [status, publicRoute, router]);

  return <>{children}</>;
}

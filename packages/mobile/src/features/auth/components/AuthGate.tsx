import { useRouter, useSegments } from "expo-router";
import { useEffect } from "react";
import type { ReactNode } from "react";

import { useAuthSessionBootstrap } from "@/features/auth/hooks/useAuthSessionBootstrap";
import { resolveAuthGateDecision } from "@/features/auth/lib/authGate";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

type AuthGateProps = { children: ReactNode };

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
 * - **サインアウト時に二重遷移が起きない前提について**: `SettingsView` の
 *   `authService.signOut().finally(...)` は `router.dismissAll()` + `router.replace("/(auth)/sign-in")`
 *   を明示的に呼ぶ。これがこの `AuthGate` の `useEffect`（`status` が `guest` に落ちたことで
 *   再評価される redirect）より先に完了するのは、「`.finally` のマイクロタスクは React の
 *   `useEffect` のフラッシュより先に走る」という JS/React のスケジューリング特性に依存しており、
 *   フレームワークが保証する契約ではない（`SettingsView.tsx` にも同旨のコメントあり）。
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
    router.replace(redirectHref);
  }, [redirectHref, router]);

  return <>{children}</>;
}

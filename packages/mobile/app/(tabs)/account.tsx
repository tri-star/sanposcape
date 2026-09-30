import { useRouter } from "expo-router";
import { useCallback } from "react";

import { AccountActionBar } from "@/features/account/components/AccountActionBar";
import type { AccountActionHref } from "@/features/account/lib/accountActions";
import type { HistoryAuthState } from "@/features/history/lib/historyStatsState";
import { HistoryView } from "@/features/history/components/HistoryView";
import { isDevToolsEnabled } from "@/config/devTools";
import { useNavigateOnce } from "@/hooks/useNavigateOnce";
import { useSignInNavigation } from "@/hooks/useSignInNavigation";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * アカウントタブ（SS-145 で記録タブから改名）。記録（`HistoryView`）と、下部（タブバーの上）の
 * 「設定」「画面カタログ（本番以外）」ボタン帯（`AccountActionBar`）を合成する（SS-148）。
 * ゲストには集計・最近の散歩の代わりにサインイン案内を出す。
 *
 * 認証セッションの値（表示名・サインイン中か）と開発ツールの可否をここで読んで渡す
 * （features/history は認証へ依存させない。ADR-M-009 決定8・SS-29 追補、.oxlintrc.json の
 * no-restricted-imports。feature 間の import も作らないので、帯は `footer` スロットで差し込む）。
 * タブ画面なので `useScreenBack` は使わない（backBehavior を奪うため）。二重遷移は `useNavigateOnce` で防ぐ。
 * 認証状態は `status` を3値（`signed-in` / `guest` / `restoring`）に写して渡す。`loading`（セッション復元中）を
 * ゲストにしないのは、コールドスタートのディープリンク（`sanposcape://account` 等）では `AuthGate` が `loading` の間も
 * children を通し、サインイン済みのユーザーにサインイン案内が一瞬見えてしまうため。復元中は `HistoryView` が読み込み表示を出す。
 * サインイン遷移は `useSignInNavigation` に、設定・画面カタログと同じラッチ（`runOnce`）を渡して共有する。
 * 遷移は push（replace にすると `(tabs)` ごと置き換わってタブバーが消える）。
 */
export default function AccountRoute() {
  const router = useRouter();
  // セレクタはプリミティブを返す（zustand v5）。
  const displayName = useAuthSessionStore((state) => state.user?.displayName ?? null);
  const status = useAuthSessionStore((state) => state.status);
  const authState: HistoryAuthState =
    status === "authenticated" ? "signed-in" : status === "loading" ? "restoring" : "guest";
  const { runOnce } = useNavigateOnce();
  const handleSignIn = useSignInNavigation(runOnce);
  const handleNavigate = useCallback(
    (href: AccountActionHref) => runOnce(() => router.push(href)),
    [runOnce, router],
  );
  return (
    <HistoryView
      displayName={displayName}
      authState={authState}
      onSignIn={handleSignIn}
      footer={
        <AccountActionBar showScreenCatalog={isDevToolsEnabled()} onNavigate={handleNavigate} />
      }
    />
  );
}

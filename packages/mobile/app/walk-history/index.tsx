import { WalkHistoryListView } from "@/features/history/components/WalkHistoryListView";
import type { HistoryAuthState } from "@/features/history/lib/historyStatsState";
import { useSignInNavigation } from "@/hooks/useSignInNavigation";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * 散歩履歴一覧（アカウントタブの記録から push）。
 *
 * ディープリンク（`sanposcape://walk-history`。開発用は `sanposcape-dev://`）で未サインインのまま直接開ける
 * （`AuthGate` はゲストも保護ルートに通す。ADR-M-009 SS-57 追補）。そのためアカウントタブ（`app/(tabs)/account.tsx`）と
 * 同じく、認証状態を3値（`signed-in` / `guest` / `restoring`）に写して渡し、ゲストにはサインイン案内を出す（SS-45）。
 * `loading`（セッション復元中）をゲストにしないのは、コールドスタートのディープリンクでサインイン済みのユーザーに
 * サインイン案内が一瞬見えてしまうため（features/history は認証へ依存させない。ADR-M-009 決定8）。
 */
export default function WalkHistoryRoute() {
  // セレクタはプリミティブを返す（zustand v5）。
  const status = useAuthSessionStore((state) => state.status);
  const authState: HistoryAuthState =
    status === "authenticated" ? "signed-in" : status === "loading" ? "restoring" : "guest";
  const handleSignIn = useSignInNavigation();
  return <WalkHistoryListView authState={authState} onSignIn={handleSignIn} />;
}

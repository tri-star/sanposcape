import { HistoryView } from "@/features/history/components/HistoryView";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * 記録タブ（履歴）。
 * 認証セッションの表示名をここで読み、HistoryView へ渡す。
 * features/history は認証へ依存させない規約（SS-13 / ADR-009 決定8、.oxlintrc.json の
 * no-restricted-imports）があるため、「認証 × 記録」の合成はルート側で行う。
 */
export default function HistoryRoute() {
  const displayName = useAuthSessionStore((state) => state.user?.displayName ?? null);
  return <HistoryView displayName={displayName} />;
}

import { HistoryView } from "@/features/history/components/HistoryView";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

/**
 * アカウントタブ（SS-145 で記録タブから改名）。本課題では記録（`HistoryView`）をそのまま表示する。
 * 設定・画面カタログのボタンは SS-148。認証セッションの表示名をここで読んで `HistoryView` に渡す
 * （features/history は認証へ依存させない。ADR-009 決定8・SS-29 追補、.oxlintrc.json の
 * no-restricted-imports）。「認証 × 記録」の合成はルート側で行う。
 */
export default function AccountRoute() {
  const displayName = useAuthSessionStore((state) => state.user?.displayName ?? null);
  return <HistoryView displayName={displayName} />;
}

export type RecentWalksTestIds = {
  /** セクションの root。 */
  section: string;
  error: string;
  loading: string;
  empty: string;
  /** 「すべて見る」ボタン。 */
  seeAll: string;
  /** index 番目のカード。 */
  item: (index: number) => string;
};

/**
 * 「最近の散歩」セクションの testID を組み立てる（SS-147）。
 * 同じセクションを記録（アカウント）タブとナビタブの2箇所に出すため、呼び出し側の接頭辞から作る。
 *
 * 接頭辞なし（undefined / 空文字）は記録（アカウント）タブの既存 testID
 * （E2E が依存しているのでリネーム禁止）。接頭辞ありは `${p}` / `${p}-error` / `${p}-loading` /
 * `${p}-empty` / `${p}-see-all` / `${p}-item-${index}`。
 */
export function recentWalksTestIds(prefix?: string): RecentWalksTestIds {
  if (!prefix) {
    return {
      section: "recent-walks-section",
      error: "recent-walks-error",
      loading: "recent-walks-loading",
      empty: "recent-walks-empty",
      seeAll: "history-see-all-walks",
      item: (index) => `recent-walk-${index}`,
    };
  }
  return {
    section: prefix,
    error: `${prefix}-error`,
    loading: `${prefix}-loading`,
    empty: `${prefix}-empty`,
    seeAll: `${prefix}-see-all`,
    item: (index) => `${prefix}-item-${index}`,
  };
}

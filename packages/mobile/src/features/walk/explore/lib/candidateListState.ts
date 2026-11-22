/**
 * 候補リストのローディング判定。
 *
 * 探索は現在地が確定して初めて実行できる（`useSpotCandidates` は origin が無いと
 * `enabled: false` でクエリを張らない）。そのため測位中は「探索エラーでもなく候補も0件」
 * という状態になり、そのままリストに渡すと「見つかりませんでした」の空状態が出てしまう。
 * 測位中も「準備中」としてローディング扱いにするための純粋関数。
 */
export function isCandidateListLoading(input: {
  /** `useSpotCandidates` が初回取得中か。 */
  isExploreLoading: boolean;
  /** 現在地が確定しているか。 */
  hasOrigin: boolean;
  /** 位置情報の取得に失敗しているか（この場合は権限通知側が案内する）。 */
  hasLocationError: boolean;
}): boolean {
  const { isExploreLoading, hasOrigin, hasLocationError } = input;
  if (isExploreLoading) return true;
  // 位置情報エラー時は通知UIに委ねるためローディングにはしない。
  return !hasOrigin && !hasLocationError;
}

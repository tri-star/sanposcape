/** RN の推奨タップ領域(44px)。DS の `--control-md`(44px)が「min touch target」とコメントされている値と同じ */
export const MIN_TOUCH_TARGET = 44;

/**
 * 見た目の一辺(幅・高さのうち小さい方)が `MIN_TOUCH_TARGET` 未満のとき、
 * 実タップ領域を `MIN_TOUCH_TARGET` まで広げるための片側 hitSlop を計算する純粋関数。
 *
 * `Button` / `IconButton` / `Switch` / `Checkbox` / `Radio` / `Tag` の各 `xxxStyles.ts` に
 * 一字一句重複していた計算式を1箇所に集約する(C-2)。
 * 見た目のサイズ自体は変えず、タップ判定領域だけを `Pressable` の `hitSlop` prop で広げる方針
 * (共通ルール「タップ領域は最低44×44。見た目が小さくても hitSlop で確保する」)。
 */
export function resolveHitSlop(visualSize: number): number {
  return Math.max(0, Math.ceil((MIN_TOUCH_TARGET - visualSize) / 2));
}

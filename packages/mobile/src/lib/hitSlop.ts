/** iOS / Android のヒューマンインターフェースガイドラインが求める最小タップ領域（px）。 */
export const MIN_TOUCH_TARGET = 44;

/**
 * 見た目のサイズが `MIN_TOUCH_TARGET` に満たないコントロールで、
 * 不足分を補うための hitSlop（1辺あたりの px）を返す。
 *
 * デザイン上は小さいコントロール（sm サイズのボタン・チェックボックスなど）でも、
 * タップ領域だけは 44px 以上を確保するために使う。
 *
 * @example hitSlopFor(34) // 5 → 34 + 5*2 = 44
 */
export function hitSlopFor(size: number): number {
  if (!Number.isFinite(size)) return 0;
  return Math.max(0, Math.ceil((MIN_TOUCH_TARGET - size) / 2));
}

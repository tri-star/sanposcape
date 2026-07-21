/**
 * 進捗値を 0〜100 の百分率に丸める。
 * `max` が 0 以下のときは 0 とみなす（ゼロ除算・NaN を UI に流さないため）。
 */
export function toPercent(value: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}

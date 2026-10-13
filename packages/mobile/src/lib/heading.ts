/**
 * 方位（北を 0 とした時計回りの度数）を [0, 360) に正規化する純粋関数（SS-169）。
 * NaN・Infinity は null（センサーの値が壊れていても描画に渡さない）。
 */
export function normalizeHeadingDegrees(degrees: number): number | null {
  if (!Number.isFinite(degrees)) return null;
  const normalized = degrees % 360;
  // -0 と 360 を 0 に揃える（-0.0 % 360 は -0、-360 % 360 も -0）。
  return normalized < 0 ? normalized + 360 : normalized === 0 ? 0 : normalized;
}

/**
 * 方位を `stepDegrees` 刻みに丸めて [0, 360) に正規化する。
 * センサーは数度単位で揺れ続けるので、刻みが変わったときだけ再描画するために使う。
 */
export function quantizeHeadingDegrees(degrees: number, stepDegrees: number): number | null {
  const normalized = normalizeHeadingDegrees(degrees);
  if (normalized === null) return null;
  if (!(stepDegrees > 0)) return normalized;
  return normalizeHeadingDegrees(Math.round(normalized / stepDegrees) * stepDegrees);
}

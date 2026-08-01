/**
 * 非有限値（NaN・Infinity）または負値を 0 にフォールバックする。
 * API レスポンス由来の数値（秒・メートル等）を安全に扱うための共通ガード。
 * `spotCandidate.ts` / `walkRoute.ts` / `finishedWalk.ts` で同じ実装が3重に重複していたため、
 * この1ファイルに集約した。
 */
export function toNonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

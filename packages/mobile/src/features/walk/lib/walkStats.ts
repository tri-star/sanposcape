/**
 * 往復時間（分）から、往復距離の目安（km・小数1桁）を見積もる純粋関数。
 * mock: `durationMin * 0.066`。
 */
export function estimateRoundTripKm(durationMin: number): number {
  return Math.round(durationMin * 0.066 * 10) / 10;
}

/** 散歩中の経過秒から距離(km)・歩数を見積もった結果。 */
export type WalkStats = {
  /** 小数1桁に丸めた距離(km)。 */
  km: number;
  /** 四捨五入した歩数。 */
  steps: number;
};

/**
 * 経過秒から距離(km)・歩数を見積もる純粋関数（mock の `km` / `steps`）。
 * `km = elapsedSec / 720`、`steps = round(elapsedSec / 720 * 1450)`。
 */
export function walkStatsFromElapsed(elapsedSec: number): WalkStats {
  const km = Math.round((elapsedSec / 720) * 10) / 10;
  const steps = Math.round((elapsedSec / 720) * 1450);
  return { km, steps };
}

/**
 * 往復時間（分）から、往復距離の目安（km・小数1桁）を見積もる純粋関数。
 * mock: `durationMin * 0.066`。
 */
export function estimateRoundTripKm(durationMin: number): number {
  return Math.round(durationMin * 0.066 * 10) / 10;
}

/** 1km あたりの歩数（歩幅 69cm 相当）。 */
export const STEPS_PER_KILOMETER = 1450;

/** 実測の移動距離(m)から歩数を見積もる純粋関数（歩数計は非スコープ）。 */
export function estimateStepsFromMeters(meters: number): number {
  const safeMeters = Number.isFinite(meters) && meters >= 0 ? meters : 0;
  return Math.round((safeMeters / 1000) * STEPS_PER_KILOMETER);
}

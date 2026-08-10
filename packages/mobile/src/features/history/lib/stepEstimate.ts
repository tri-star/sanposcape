import { toNonNegative } from "@/lib/numberGuard";

/**
 * 歩数推定に使う 1 歩あたりの歩幅(m)。成人の平均的な歩幅として固定値を採用する
 * （SS-42 / ADR-003 追補）。個人の身長・歩幅設定を反映する場合は設定機能とセットで再検討する。
 */
export const ESTIMATED_STRIDE_METERS = 0.7;

/**
 * 距離(m) から歩数を推定する純粋関数。
 * `steps = round(distance_meters / ESTIMATED_STRIDE_METERS)`。
 * サーバーは歩数を持たない（`WalkStatsTodayRead` に `steps` は無い）ため、
 * 表示上の推定ヒューリスティックとしてクライアント側だけで計算する。
 * 負値・非有限値（NaN・Infinity）は 0 として扱う。
 */
export function estimateSteps(distanceMeters: number): number {
  return Math.round(toNonNegative(distanceMeters) / ESTIMATED_STRIDE_METERS);
}

/**
 * 歩数カードの見出し。実測値と誤認されないよう「推定」を含める。
 * 文言を lib に置くのは、コンポーネントのレンダリングテストが書けない環境で
 * 表示文言の検証を Vitest に寄せるため（`walkHistoryEmptyState.ts` と同じ考え方）。
 */
export const ESTIMATED_STEPS_LABEL = "今日の推定歩数";

/** 歩数カードの注記。距離からの換算であることと歩幅の根拠を明示する。 */
export const ESTIMATED_STEPS_NOTE = "歩いた距離から換算した推定値です（歩幅 0.7m 換算）。";

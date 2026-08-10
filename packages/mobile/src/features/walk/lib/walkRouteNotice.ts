import type { ExploreErrorCode } from "@/features/walk/lib/exploreError";
import type { WalkRouteRecalcStatus } from "@/features/walk/types";

export type WalkRouteNoticeKind =
  | "none"
  /** ルートが1つも取得できていない（初期取得の失敗）。既存の再試行導線を出す。 */
  | "base_error"
  /** 現在地起点の再計算中。 */
  | "recalculating"
  /** 再計算に失敗。表示中のルートは直前の正常ルートのまま。 */
  | "recalc_failed"
  /** 現在地が取れず再計算できない（受け入れ条件2）。 */
  | "recalc_unavailable";

/**
 * 「いまルート周りのどの通知を出すか」を1つに集約する純粋関数。
 * `WalkActiveView` から条件分岐を追い出し、判定だけでも Vitest で守る。
 *
 * 優先順位（この順で最初に該当したものを返す）:
 * 1. recalcStatus === "recalculating" → "recalculating"
 * 2. recalcStatus === "failed" → "recalc_failed"
 * 3. !hasRoute && baseErrorCode !== null → "base_error"
 *    （`!hasRoute` 条件つきなのは、再計算に成功して画面にルートが出ているのに
 *      初期取得のエラーバナーが残る、という矛盾表示を避けるため）
 * 4. hasRoute && !canRecalculate → "recalc_unavailable"
 * 5. それ以外 → "none"
 */
export function walkRouteNoticeKind(input: {
  /** 表示できるルートがあるか（実効ルート !== null）。 */
  hasRoute: boolean;
  /** useWalkRoute（初期ルート）のエラー分類。 */
  baseErrorCode: ExploreErrorCode | null;
  recalcStatus: WalkRouteRecalcStatus;
  /** 現在地・目的地が揃っていて再計算リクエストを組み立てられるか。 */
  canRecalculate: boolean;
}): WalkRouteNoticeKind {
  if (input.recalcStatus === "recalculating") {
    return "recalculating";
  }
  if (input.recalcStatus === "failed") {
    return "recalc_failed";
  }
  if (!input.hasRoute && input.baseErrorCode !== null) {
    return "base_error";
  }
  if (input.hasRoute && !input.canRecalculate) {
    return "recalc_unavailable";
  }
  return "none";
}

import type { ExploreErrorCode } from "@/features/walk/lib/exploreError";
import type { WalkRoute, WalkRouteRecalcStatus } from "@/features/walk/types";

export type RouteRecalcState = {
  status: WalkRouteRecalcStatus;
  /** 最後に成功した再計算ルート。null の間は初期ルート（useWalkRoute）を表示する。 */
  route: WalkRoute | null;
  /** 直近の失敗の分類。status === "failed" のときのみ非 null。 */
  errorCode: ExploreErrorCode | null;
  /** 反映を受け付けるリクエスト世代。0 は未発行。 */
  sequence: number;
};

export const INITIAL_ROUTE_RECALC_STATE: RouteRecalcState = {
  status: "idle",
  route: null,
  errorCode: null,
  sequence: 0,
};

/**
 * 再計算の状態遷移（純粋関数）。
 *
 * SS-33 で**自動再計算を廃止**した。再計算はユーザーが「ルートを再計算」を押したときだけ走る
 * ため、逸脱カウント・最小間隔・連続失敗による自動停止といった「呼び出し抑制」の状態は
 * すべて不要になった（押下1回につき最大1リクエストで、多重起動は status === "recalculating"
 * のガードと sequence の世代管理だけで防げる）。経緯は
 * `packages/mobile/adr/ADR-008-active-walk-state-and-route-cache.md` の決定7 を参照。
 */

/** リクエスト開始。sequence は呼び出し側（hook）が単調増加で採番して渡す。取得中も直前のルートを表示し続ける。 */
export function beginRecalculation(
  state: RouteRecalcState,
  input: { sequence: number },
): RouteRecalcState {
  return {
    ...state,
    status: "recalculating",
    errorCode: null,
    sequence: input.sequence,
  };
}

/** 成功の反映。sequence が state.sequence と一致しないときは state をそのまま返す（古い応答の破棄）。 */
export function applyRecalculationSuccess(
  state: RouteRecalcState,
  input: { sequence: number; route: WalkRoute },
): RouteRecalcState {
  if (input.sequence !== state.sequence) {
    return state;
  }
  return {
    ...state,
    status: "idle",
    route: input.route,
    errorCode: null,
  };
}

/** 失敗の反映。sequence 不一致なら無視。state.route（直前の正常ルート）は保持する。 */
export function applyRecalculationFailure(
  state: RouteRecalcState,
  input: { sequence: number; errorCode: ExploreErrorCode },
): RouteRecalcState {
  if (input.sequence !== state.sequence) {
    return state;
  }
  return {
    ...state,
    status: "failed",
    errorCode: input.errorCode,
  };
}

/**
 * 散歩終了・別の散歩へ切り替わったときの初期化。
 *
 * sequence の規律（重要）: sequence の採番は hook の useRef が持ち、**リセットでも巻き戻さない**
 * （単調増加）。リセット後に state.sequence が 0 に戻るため、リセット前に飛んだリクエスト
 * （seq >= 1）が後から解決しても sequence 不一致で必ず捨てられる。採番をリセットすると
 * 番号が衝突しうる。
 */
export function resetRecalculation(): RouteRecalcState {
  return INITIAL_ROUTE_RECALC_STATE;
}

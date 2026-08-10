import { isRetriableExploreError } from "@/features/walk/lib/exploreError";
import type { ExploreErrorCode } from "@/features/walk/lib/exploreError";
import type { WalkRoute, WalkRouteRecalcStatus } from "@/features/walk/types";

/** 自動再計算の最小間隔（ms）。手動再計算には適用しない。 */
export const RECALCULATION_MIN_INTERVAL_MS = 60_000;

/** 自動再計算を発火させるのに必要な、連続して「逸脱」と判定された測位の回数。 */
export const REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES = 2;

/** 自動再計算を止めるまでの連続失敗回数（以降は手動のみ）。 */
export const MAX_CONSECUTIVE_AUTO_FAILURES = 2;

export type RouteRecalcState = {
  status: WalkRouteRecalcStatus;
  /** 最後に成功した再計算ルート。null の間は初期ルート（useWalkRoute）を表示する。 */
  route: WalkRoute | null;
  /** 直近の失敗の分類。status === "failed" のときのみ非 null。 */
  errorCode: ExploreErrorCode | null;
  /** 反映を受け付けるリクエスト世代。0 は未発行。 */
  sequence: number;
  /** 連続で「逸脱」と判定された測位の回数。 */
  offRouteCount: number;
  /** 直近にリクエストを開始した時刻（自動/手動どちらでも更新）。 */
  lastRequestAtMs: number | null;
  /** 連続失敗回数。成功で 0 に戻る。 */
  consecutiveFailures: number;
};

export const INITIAL_ROUTE_RECALC_STATE: RouteRecalcState = {
  status: "idle",
  route: null,
  errorCode: null,
  sequence: 0,
  offRouteCount: 0,
  lastRequestAtMs: null,
  consecutiveFailures: 0,
};

/**
 * 測位1件を取り込み、逸脱カウントだけを更新する（offRoute が false なら 0 にリセット）。
 * 値が変わらない場合は同じ参照を返す（`walkTrack.appendWalkTrackPoint` と同じ規律。
 * 不要な再レンダリングを避ける）。
 */
export function observeRoutePosition(
  state: RouteRecalcState,
  input: { offRoute: boolean },
): RouteRecalcState {
  const nextOffRouteCount = input.offRoute ? state.offRouteCount + 1 : 0;
  if (nextOffRouteCount === state.offRouteCount) {
    return state;
  }
  return { ...state, offRouteCount: nextOffRouteCount };
}

/**
 * 自動再計算を開始してよいか。すべて満たす場合のみ true:
 * 1. 多重起動防止（受け入れ条件4の一次防御）
 * 2. 現在地がある
 * 3. 一時停止していない（API を使わない）
 * 4. 連続逸脱が REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES 回以上
 * 5. 前回リクエストから RECALCULATION_MIN_INTERVAL_MS 以上経過（または初回）
 * 6. 連続失敗が MAX_CONSECUTIVE_AUTO_FAILURES 未満
 * 7. 直近の失敗が再試行しても無駄な分類でない（401/422 など）
 */
export function shouldStartRecalculation(
  state: RouteRecalcState,
  input: { hasPosition: boolean; paused: boolean; nowMs: number },
): boolean {
  if (state.status === "recalculating") return false;
  if (!input.hasPosition) return false;
  if (input.paused) return false;
  if (state.offRouteCount < REQUIRED_CONSECUTIVE_OFF_ROUTE_FIXES) return false;
  if (
    state.lastRequestAtMs !== null &&
    input.nowMs - state.lastRequestAtMs < RECALCULATION_MIN_INTERVAL_MS
  ) {
    return false;
  }
  if (state.consecutiveFailures >= MAX_CONSECUTIVE_AUTO_FAILURES) return false;
  if (state.status === "failed" && !isRetriableExploreError(state.errorCode ?? "unknown")) {
    return false;
  }
  return true;
}

/** リクエスト開始。sequence は呼び出し側（hook）が単調増加で採番して渡す。取得中も直前のルートを表示し続ける。 */
export function beginRecalculation(
  state: RouteRecalcState,
  input: { nowMs: number; sequence: number },
): RouteRecalcState {
  return {
    ...state,
    status: "recalculating",
    errorCode: null,
    sequence: input.sequence,
    lastRequestAtMs: input.nowMs,
    offRouteCount: 0,
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
    consecutiveFailures: 0,
    offRouteCount: 0,
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
    consecutiveFailures: state.consecutiveFailures + 1,
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { fetchWalkRoute } from "@/features/walk/api/walkRouteApi";
import type { ExploreErrorCode } from "@/features/walk/lib/exploreError";
import { toExploreErrorCode } from "@/features/walk/lib/exploreError";
import { isOffRoute } from "@/features/walk/lib/routeDeviation";
import {
  applyRecalculationFailure,
  applyRecalculationSuccess,
  beginRecalculation,
  INITIAL_ROUTE_RECALC_STATE,
  observeRoutePosition,
  resetRecalculation,
  shouldStartRecalculation,
  type RouteRecalcState,
} from "@/features/walk/lib/routeRecalculation";
import type { WalkLegPhase } from "@/features/walk/lib/walkRouteLeg";
import {
  buildReturnToStartRouteRequest,
  buildWalkingRouteRequest,
  RETURN_TO_START_DESTINATION_NAME,
} from "@/features/walk/lib/walkRouteRequest";
import type { ActiveWalk, WalkRoute, WalkRouteRecalcStatus } from "@/features/walk/types";
import type { GeoCoordinates } from "@/services/location/types";

export type UseWalkRouteRecalculationInput = {
  activeWalk: ActiveWalk | null;
  /** useWalkRoute が返す初期ルート（散歩開始時の origin 起点）。 */
  baseRoute: WalkRoute | null;
  currentPosition: GeoCoordinates | null;
  paused: boolean;
  /** 往路なら「現在地起点の周回」、復路なら「現在地 → 出発地の片道」を引き直す（SS-33）。 */
  legPhase: WalkLegPhase;
};

export type UseWalkRouteRecalculationResult = {
  /** 表示すべき実効ルート（再計算に成功していれば新ルート、なければ baseRoute）。 */
  route: WalkRoute | null;
  /** 実効ルートが再計算由来か（ヘッダーの文言切り替えに使う）。 */
  isRecalculated: boolean;
  status: WalkRouteRecalcStatus;
  errorCode: ExploreErrorCode | null;
  /** 現在地と目的地が揃っていてリクエストを組み立てられるか。 */
  canRecalculate: boolean;
  /** 手動再計算/再試行。recalculating 中は何もしない。 */
  recalculate: () => void;
};

/**
 * 再計算の副作用層（SS-35）。`fetchWalkRoute` の実行・`AbortController`・世代採番・
 * アンマウント/散歩終了時のキャンセルを担う。判定は `lib/routeDeviation.ts` /
 * `lib/routeRecalculation.ts` の純粋関数に委譲し、この hook 自体には分岐ロジックを
 * ほとんど置かない（Vitest 対象外の層を薄くするため）。
 *
 * やらないこと（レビューでの質問を先回りして書いておく）:
 * - **TanStack Query（useQuery / queryClient.fetchQuery）は使わない**。理由:
 *   (a) `useWalkRoute` の入力（origin）を現在地に変えると queryKey が変わり、取得中・失敗時に
 *       `data` が undefined に落ちて直前のルートが画面から消える（受け入れ条件3 に反する）。
 *       `placeholderData: keepPreviousData` は pending 中しか効かず、error 状態は救えない。
 *   (b) 世代の追い越し制御を自前で持てない。
 *   → 再計算ルートだけを hook のローカル state に置き、初期ルートは従来どおり Query の
 *     キャッシュ共有（ADR-008 決定2）を維持する。
 * - `queryClient.setQueryData` によるキャッシュ投入もしない。`useWalkRoute` は常に
 *   `ActiveWalk.origin` で引くため、投入しても誰も読まない。
 * - `ActiveWalk.origin` は更新しない（散歩の起点であり、`useWalkTracking.initialPosition` にも
 *   使われている）。
 * - **復路で周回を引き直さない**。復路の逸脱で `route_type: "loop"` を投げると
 *   「もう一度目的地へ行って戻る」ルートが返り、ユーザーを来た方向へ引き返させてしまう。
 *   復路は「現在地 → 出発地」の片道（`route_type: "one_way"`）で引き直す。
 *   この片道ルートは `legs` が空・`returnIsSamePath` が false になるため、地図は
 *   `WalkRouteLegPolylines` の単線分岐で描かれる（往路/復路バッジは「復路」のままラッチされる）。
 */
export function useWalkRouteRecalculation(
  input: UseWalkRouteRecalculationInput,
): UseWalkRouteRecalculationResult {
  const { activeWalk, baseRoute, currentPosition, paused, legPhase } = input;

  const [state, setState] = useState<RouteRecalcState>(INITIAL_ROUTE_RECALC_STATE);

  // effect 内で同一 tick の判定に使うため、レンダーのたびに最新値を代入する
  // （`useWalkTracking` の `pausedRef` と同じ手法。依存配列を絞るための ref）。
  const stateRef = useRef(state);
  stateRef.current = state;

  // 単調増加。**リセットしない**（routeRecalculation.ts の sequence の規律を参照）。
  const sequenceRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const mountedRef = useRef(true);

  const route = state.route ?? baseRoute;
  const routeRef = useRef(route);
  routeRef.current = route;

  const destinationRef = useRef(activeWalk?.destination ?? null);
  destinationRef.current = activeWalk?.destination ?? null;

  const legPhaseRef = useRef(legPhase);
  legPhaseRef.current = legPhase;

  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const activeWalkRef = useRef(activeWalk);
  activeWalkRef.current = activeWalk;

  const request = useMemo(
    () =>
      legPhase === "return"
        ? buildReturnToStartRouteRequest({
            origin: currentPosition,
            start: activeWalk?.origin ?? null,
          })
        : buildWalkingRouteRequest({
            origin: currentPosition,
            destination: activeWalk?.destination ?? null,
            routeType: "loop",
          }),
    [currentPosition, activeWalk?.destination, activeWalk?.origin, legPhase],
  );
  const requestRef = useRef(request);
  requestRef.current = request;
  const canRecalculate = request !== null;

  const start = useCallback((nowMs: number) => {
    const req = requestRef.current;
    const isReturn = legPhaseRef.current === "return";
    // 往路は目的地（destinationRef）が要る。復路は出発地（activeWalkOriginRef）を使うため
    // destination の有無をガードにしない（復路は destination.placeId を使わない）。
    if (req === null) return;
    if (!isReturn && destinationRef.current === null) return;

    abortRef.current?.abort(); // 保留中があれば捨てる
    const controller = new AbortController();
    abortRef.current = controller;

    sequenceRef.current += 1;
    const sequence = sequenceRef.current;
    setState((prev) => beginRecalculation(prev, { nowMs, sequence }));

    const destinationName = isReturn
      ? RETURN_TO_START_DESTINATION_NAME
      : destinationRef.current!.name;

    fetchWalkRoute(req, { signal: controller.signal, destinationName })
      .then((newRoute) => {
        if (!mountedRef.current || controller.signal.aborted) return;
        setState((prev) => applyRecalculationSuccess(prev, { sequence, route: newRoute }));
      })
      .catch((error: unknown) => {
        // abort は失敗扱いにしない。
        if (!mountedRef.current || controller.signal.aborted) return;
        setState((prev) =>
          applyRecalculationFailure(prev, { sequence, errorCode: toExploreErrorCode(error) }),
        );
      });
  }, []);

  // 自動トリガの effect。依存を currentPosition だけにするのが要点。
  // paused や activeWalk を依存に入れると、同じ測位で observeRoutePosition が二重に走り
  // offRouteCount が水増しされる。useWalkTracking は測位ごとに新しいオブジェクトを
  // currentPosition に入れるため、参照比較で1測位1回になる。
  useEffect(() => {
    if (activeWalkRef.current === null || currentPosition === null) return;
    const currentRoute = routeRef.current;
    const offRoute = currentRoute !== null && isOffRoute(currentPosition, currentRoute);
    const observed = observeRoutePosition(stateRef.current, { offRoute });
    stateRef.current = observed; // 同一 tick 内の判定に使うため同期的に反映する
    setState(observed);

    const nowMs = Date.now();
    if (
      shouldStartRecalculation(observed, { hasPosition: true, paused: pausedRef.current, nowMs })
    ) {
      start(nowMs);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 測位1件につき1回だけ評価する（paused 等は ref で読む）
  }, [currentPosition]);

  // 散歩終了・別の散歩へ切り替わったときの初期化（受け入れ条件5）。
  // activeWalk が null になる（散歩終了 / サインアウトの sessionCleanup）と
  // clientWalkId が undefined になり effect が走る。マウント直後にも1回走るが、
  // 初期状態への setState なので無害。
  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setState(resetRecalculation());
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 散歩が切り替わったときだけリセットする
  }, [activeWalk?.clientWalkId]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // 手動は RECALCULATION_MIN_INTERVAL_MS と MAX_CONSECUTIVE_AUTO_FAILURES をバイパスする
  // （ユーザーの明示操作で、押下1回につき最大1リクエスト。lastRequestAtMs は更新されるので、
  // 次の自動トリガは手動から60秒後になる）。
  const recalculate = useCallback(() => {
    if (stateRef.current.status === "recalculating") return; // 連打で多重起動しない
    start(Date.now());
  }, [start]);

  return {
    route,
    isRecalculated: state.route !== null,
    status: state.status,
    errorCode: state.errorCode,
    canRecalculate,
    recalculate,
  };
}

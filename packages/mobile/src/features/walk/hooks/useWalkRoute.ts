import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { fetchWalkRoute } from "@/features/walk/api/walkRouteApi";
import type { ExploreErrorCode } from "@/features/walk/lib/exploreError";
import { toExploreErrorCode } from "@/features/walk/lib/exploreError";
import { buildWalkingRouteRequest } from "@/features/walk/lib/walkRouteRequest";
import type { WalkDestination, WalkRoute } from "@/features/walk/types";
import type { GeoCoordinates } from "@/services/location/types";

/**
 * 固定2点間の周回ルートは実質不変（経由点の生成が backend 側で決定的である前提。
 * 非決定的なら backend のキャッシュで吸収される）。散歩中に再取得させないため1時間。
 * `routeType` は既定の `loop` を使う（`buildWalkingRouteRequest` の省略時の挙動）。
 */
const STALE_TIME_MS = 60 * 60_000;
/** 散歩開始画面のアンマウントから散歩中画面のマウントまでの間、キャッシュを確実に生かすため（往復最大120分の散歩も想定）。 */
const GC_TIME_MS = 2 * 60 * 60_000;

export type UseWalkRouteResult = {
  walkRoute: WalkRoute | null;
  /** 初回取得中。 */
  isLoading: boolean;
  errorCode: ExploreErrorCode | null;
  retry: () => void;
};

/**
 * ルート取得の TanStack Query ラッパ。
 * 散歩開始画面と散歩中画面の両方から同じ入力（origin, destination）で呼ぶことで、
 * キャッシュ共有により API 呼び出しを1回に抑える（origin は散歩の起点で固定し、
 * 現在地の更新のたびにこの hook の入力を変えてはいけない。毎分ルートを引き直すと 429 になる）。
 *
 * `placeholderData: keepPreviousData` は使わない — 別スポットを選んだ瞬間に前のルートが残ると、
 * 線と選択ピンが食い違うため。
 */
export function useWalkRoute(input: {
  origin: GeoCoordinates | null;
  destination: WalkDestination | null;
}): UseWalkRouteResult {
  // queryKey は構造的ハッシュのため request の参照が毎回変わっても実害は無いが、
  // 将来 queryFn 以外の場所で request の参照同一性に依存するコードが増えても壊れないよう
  // useMemo で明示的に安定させておく（`input.origin`/`input.destination` が変わったときだけ作り直す）。
  const request = useMemo(
    () => buildWalkingRouteRequest({ origin: input.origin, destination: input.destination }),
    [input.origin, input.destination],
  );

  const query = useQuery({
    queryKey: ["explore", "routeWalking", request],
    queryFn: ({ signal }) =>
      fetchWalkRoute(request!, { signal, destinationName: input.destination!.name }),
    enabled: request !== null,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    retry: false,
  });

  const { refetch: queryRefetch } = query;
  const retry = useCallback(() => {
    void queryRefetch();
  }, [queryRefetch]);

  return {
    walkRoute: query.data ?? null,
    isLoading: query.isPending && request !== null,
    errorCode: query.error ? toExploreErrorCode(query.error) : null,
    retry,
  };
}

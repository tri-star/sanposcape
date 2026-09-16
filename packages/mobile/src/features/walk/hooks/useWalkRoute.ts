import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { fetchWalkRoute } from "@/features/walk/api/walkRouteApi";
import type { ExploreErrorCode } from "@/features/walk/lib/exploreError";
import { toExploreErrorCode } from "@/features/walk/lib/exploreError";
import { buildWalkingRouteRequest } from "@/features/walk/lib/walkRouteRequest";
import type { WalkDestination, WalkRoute } from "@/features/walk/types";
import type { GeoCoordinates } from "@/services/location/types";

/** 開始前のプレビューだけをキャッシュする。開始後はactiveWalkRouteを参照する。 */
const STALE_TIME_MS = 5 * 60_000;
const GC_TIME_MS = 30 * 60_000;

export type UseWalkRouteResult = {
  walkRoute: WalkRoute | null;
  /** 初回取得中。 */
  isLoading: boolean;
  errorCode: ExploreErrorCode | null;
  retry: () => void;
};

/** 開始前の周回プレビュー。目的地変更時に以前のルートを表示しない。 */
export function useWalkRoute(input: {
  origin: GeoCoordinates | null;
  destination: WalkDestination | null;
  durationMin: number;
}): UseWalkRouteResult {
  // queryKey は構造的ハッシュのため request の参照が毎回変わっても実害は無いが、
  // 将来 queryFn 以外の場所で request の参照同一性に依存するコードが増えても壊れないよう
  // useMemo で明示的に安定させておく（`input.origin`/`input.destination` が変わったときだけ作り直す）。
  const request = useMemo(() => {
    const base = buildWalkingRouteRequest({ origin: input.origin, destination: input.destination });
    return base ? { ...base, round_trip_duration_minutes: input.durationMin } : null;
  }, [input.origin, input.destination, input.durationMin]);

  const query = useQuery({
    queryKey: ["explore", "routeRoundTrip", request],
    queryFn: ({ signal }) =>
      fetchWalkRoute(request!, { signal, destinationName: input.destination!.name }),
    enabled: request !== null,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const { refetch: queryRefetch } = query;
  const retry = useCallback(() => {
    void queryRefetch();
  }, [queryRefetch]);

  return {
    walkRoute: query.data ?? null,
    isLoading: query.isFetching && request !== null,
    errorCode: query.error ? toExploreErrorCode(query.error) : null,
    retry,
  };
}

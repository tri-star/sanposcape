import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import type { ExploreCategory } from "@/api/generated/model";
import { fetchSpotCandidates } from "@/features/walk/api/exploreApi";
import { toExploreErrorCode } from "@/features/walk/lib/exploreError";
import type { ExploreErrorCode } from "@/features/walk/lib/exploreError";
import { buildPlaceSearchRequest } from "@/features/walk/lib/placeSearchRequest";
import type { SpotCandidate } from "@/features/walk/types";
import type { GeoCoordinates } from "@/services/location/types";

/** backend の provider キャッシュ TTL（300秒）と揃える。 */
const STALE_TIME_MS = 5 * 60_000;
/** 条件を戻したときに再取得しないための保持時間。 */
const GC_TIME_MS = 30 * 60_000;

export type UseSpotCandidatesResult = {
  candidates: SpotCandidate[];
  /** 初回取得中（候補がまだ1件も無い）。 */
  isLoading: boolean;
  /** 条件変更による再取得中（前回結果を表示したまま）。 */
  isRefetching: boolean;
  errorCode: ExploreErrorCode | null;
  refetch: () => void;
};

/**
 * 探索候補の取得 hook。
 * API 呼び出しコストを抑えるため、`enabled`/`staleTime`/`retry:false` を明示的に制御する
 * （backend が1探索あたり最大21回の外部呼び出しをするため。§6.3）。
 */
export function useSpotCandidates(input: {
  origin: GeoCoordinates | null;
  durationMin: number;
  categories: readonly ExploreCategory[];
}): UseSpotCandidatesResult {
  const request = buildPlaceSearchRequest(input);

  const query = useQuery({
    queryKey: ["explore", "places", request],
    queryFn: ({ signal }) => fetchSpotCandidates(request!, { signal }),
    enabled: request !== null,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    retry: false,
    placeholderData: keepPreviousData,
  });

  const { refetch: queryRefetch } = query;
  const refetch = useCallback(() => {
    void queryRefetch();
  }, [queryRefetch]);

  return {
    candidates: query.data ?? [],
    isLoading: query.isPending && request !== null,
    isRefetching: query.isFetching && !query.isPending,
    errorCode: query.error ? toExploreErrorCode(query.error) : null,
    refetch,
  };
}

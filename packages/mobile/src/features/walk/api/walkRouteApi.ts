import { ApiError } from "@/api/apiError";
import { getLoopWalkingRouteExploreRoutesLoop } from "@/api/generated/endpoints/explore/explore";
import type { WalkingRouteRequest } from "@/api/generated/model";
import { toWalkRoute } from "@/features/walk/lib/walkRoute";
import type { WalkRoute } from "@/features/walk/types";

/**
 * /explore/routes/loop を叩いて WalkRoute（周回ルート）を返す fetcher。
 * `exploreApi.ts` と同じ理由で hook（`useGetLoopWalkingRouteExploreRoutesLoop`）ではなく素の
 * fetcher を使う: queryKey / `enabled` / `retry` / `staleTime` を自前で制御したいのと、
 * `react-native` を値 import しないので node の vitest でテストできるため。
 *
 * この層は services/auth を一切 import しない（認証は customFetch が authTokenProvider
 * 経由で付ける）。探索のロジックが認証に不可分に依存しない、という M4 完了条件を
 * 散歩開始・散歩中でも維持する。
 */
export async function fetchWalkRoute(
  request: WalkingRouteRequest,
  options?: { signal?: AbortSignal; destinationName?: string },
): Promise<WalkRoute> {
  const response = await getLoopWalkingRouteExploreRoutesLoop(request, { signal: options?.signal });
  if (response.status !== 200) {
    // customFetch は非2xx で ApiError を throw するため通常ここには来ない（型の網羅のため）。
    throw new ApiError(response.status);
  }
  return toWalkRoute(response.data, options?.destinationName);
}

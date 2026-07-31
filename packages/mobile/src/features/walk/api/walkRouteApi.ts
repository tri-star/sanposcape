import { ApiError } from "@/api/apiError";
import { getWalkingRouteExploreRoutesWalking } from "@/api/generated/endpoints/explore/explore";
import type { WalkingRouteRequest } from "@/api/generated/model";
import { toWalkRoute } from "@/features/walk/lib/walkRoute";
import type { WalkRoute } from "@/features/walk/types";

/**
 * /explore/routes/walking を叩いて WalkRoute を返す fetcher。
 * `exploreApi.ts` と同じ理由で hook（`useGetWalkingRouteExploreRoutesWalking`）ではなく素の
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
  const response = await getWalkingRouteExploreRoutesWalking(request, { signal: options?.signal });
  if (response.status !== 200) {
    // customFetch は非2xx で ApiError を throw するため通常ここには来ない（型の網羅のため）。
    throw new ApiError(response.status);
  }
  return toWalkRoute(response.data, options?.destinationName);
}

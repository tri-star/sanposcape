import {
  searchExplorePlaces,
  getWalkingRouteExploreRoutesWalking,
} from "@/api/generated/endpoints/explore/explore";
import type { PlaceSearchRequest } from "@/api/generated/model/placeSearchRequest";
import type { PlaceSearchResponse } from "@/api/generated/model/placeSearchResponse";
import type { WalkingRouteRequest } from "@/api/generated/model/walkingRouteRequest";
import type { WalkingRouteResponse } from "@/api/generated/model/walkingRouteResponse";

/** Orval は HTTP ステータスの union を型に出すが、customFetch は成功時の JSON body を返す。 */
export async function fetchPlaces(
  request: PlaceSearchRequest,
  signal?: AbortSignal,
): Promise<PlaceSearchResponse> {
  return (await searchExplorePlaces(request, { signal })) as unknown as PlaceSearchResponse;
}

export async function fetchWalkingRoute(
  request: WalkingRouteRequest,
  signal?: AbortSignal,
): Promise<WalkingRouteResponse> {
  return (await getWalkingRouteExploreRoutesWalking(request, {
    signal,
  })) as unknown as WalkingRouteResponse;
}

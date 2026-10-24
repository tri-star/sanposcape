import { ApiError } from "@/api/apiError";
import { findNearestStationExplore } from "@/api/generated/endpoints/explore/explore";
import type { NearestStationRequest } from "@/api/generated/model";

/**
 * `POST /explore/nearest-station` で、ピンの位置の最寄り駅のタグの表記を引く（SS-225）。
 * 3km 以内に駅が無いときは null。
 */
export async function fetchPinNearestStationTag(
  request: NearestStationRequest,
  options: { signal?: AbortSignal },
): Promise<string | null> {
  const response = await findNearestStationExplore(request, { signal: options.signal });
  if (response.status !== 200) {
    // customFetch は非2xx で ApiError を throw するため通常ここには来ない（型の網羅のため）。
    throw new ApiError(response.status);
  }
  return response.data.station?.tag_label ?? null;
}

import { ApiError } from "@/api/apiError";
import { reverseGeocodeExplore } from "@/api/generated/endpoints/explore/explore";
import type { ReverseGeocodeRequest } from "@/api/generated/model";
import { buildDefaultPinName } from "@/features/pin/lib/pinDefaultName";

/**
 * `POST /explore/reverse-geocode`（SS-138）でピンの位置の住所を引き、ピン名の初期値にして返す。
 * 住所が無い場所では null。
 */
export async function fetchPinDefaultName(
  request: ReverseGeocodeRequest,
  options: { signal?: AbortSignal },
): Promise<string | null> {
  const response = await reverseGeocodeExplore(request, { signal: options.signal });
  if (response.status !== 200) {
    // customFetch は非2xx で ApiError を throw するため通常ここには来ない（型の網羅のため）。
    throw new ApiError(response.status);
  }
  return buildDefaultPinName({
    address: response.data.address,
    buildingName: response.data.building_name,
  });
}

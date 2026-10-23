import { ApiError } from "@/api/apiError";
import { reverseGeocodeExplore } from "@/api/generated/endpoints/explore/explore";
import type { ReverseGeocodeRequest } from "@/api/generated/model";
import { toPinAddress, type PinAddress } from "@/features/pin/lib/pinAddress";

/**
 * `POST /explore/reverse-geocode` でピンの位置の住所を引く（ピン詳細に表示する。SS-212）。
 * 住所が無い場所では null。
 */
export async function fetchPinAddress(
  request: ReverseGeocodeRequest,
  options: { signal?: AbortSignal },
): Promise<PinAddress | null> {
  const response = await reverseGeocodeExplore(request, { signal: options.signal });
  if (response.status !== 200) {
    // customFetch は非2xx で ApiError を throw するため通常ここには来ない（型の網羅のため）。
    throw new ApiError(response.status);
  }
  return toPinAddress({
    address: response.data.address,
    buildingName: response.data.building_name,
  });
}

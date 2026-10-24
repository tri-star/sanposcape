import type { NearestStationRequest } from "@/api/generated/model";
import { buildPinAddressRequest } from "@/features/pin/lib/pinAddressRequest";
import type { GeoCoordinates } from "@/services/location/types";

/**
 * ピンの位置の最寄り駅を引く `POST /explore/nearest-station` の送信ボディ（SS-225）。
 * 住所と同じく、座標は保存するピンと同じ小数6桁に揃える（保存する位置より精度の高い値を送らない）。
 * 座標が不正なら null（送らない）。
 */
export function buildPinNearestStationRequest(
  location: GeoCoordinates,
): NearestStationRequest | null {
  return buildPinAddressRequest(location);
}

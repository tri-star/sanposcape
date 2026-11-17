import type { ReverseGeocodeRequest } from "@/api/generated/model";
import { isValidCoordinate } from "@/lib/geoCoordinate";
import type { GeoCoordinates } from "@/services/location/types";

const COORDINATE_PRECISION = 1e6;

function roundCoordinate(value: number): number {
  return Math.round(value * COORDINATE_PRECISION) / COORDINATE_PRECISION;
}

/**
 * ピンの位置の住所を引く `POST /explore/reverse-geocode` の送信ボディ（SS-138。SS-212 からはピン詳細で使う）。
 * 座標は保存するピンと同じ小数6桁（`buildPinCreateRequest`）に揃え、保存した位置より精度の高い値を送らない。
 * 座標が不正なら null（送らない）。
 */
export function buildPinAddressRequest(location: GeoCoordinates): ReverseGeocodeRequest | null {
  if (!isValidCoordinate(location)) return null;
  return {
    location: {
      latitude: roundCoordinate(location.latitude),
      longitude: roundCoordinate(location.longitude),
    },
  };
}

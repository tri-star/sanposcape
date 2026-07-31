import type { WalkingRouteRequest } from "@/api/generated/model";
import { roundCoordinate } from "@/features/walk/lib/placeSearchRequest";
import type { WalkDestination } from "@/features/walk/types";
import type { GeoCoordinates } from "@/services/location/types";

/** destination.name の上限（backend の max_length=256 に合わせる）。 */
export const DESTINATION_NAME_MAX_LENGTH = 256;

/**
 * ルート取得リクエストを組み立てる。送信できない条件なら null を返す。
 * - origin が null / destination が null / placeId が空文字
 */
export function buildWalkingRouteRequest(input: {
  origin: GeoCoordinates | null;
  destination: WalkDestination | null;
}): WalkingRouteRequest | null {
  const { origin, destination } = input;
  if (origin === null || destination === null) {
    return null;
  }

  const placeId = destination.placeId.trim();
  if (placeId.length === 0) {
    return null;
  }

  const name = destination.name.trim();

  return {
    // GPS の揺れで queryKey と backend のキャッシュキーが毎回変わるのを防ぐため小数4桁に丸める。
    origin: {
      latitude: roundCoordinate(origin.latitude),
      longitude: roundCoordinate(origin.longitude),
    },
    destination: {
      place_id: placeId,
      // destination.location は /explore/places のレスポンス由来で既に安定しているため丸めない。
      location: {
        latitude: destination.location.latitude,
        longitude: destination.location.longitude,
      },
      name: name.length === 0 ? undefined : name.slice(0, DESTINATION_NAME_MAX_LENGTH),
    },
  };
}

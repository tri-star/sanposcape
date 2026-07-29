import { getLocationMode } from "@/config/locationMode";
import { createMockLocationService } from "@/services/location/location.mock";
import { createRealLocationService } from "@/services/location/location.real";
import type { LocationService } from "@/services/location/types";

export type {
  GeoCoordinates,
  LocationPermissionStatus,
  LocationService,
} from "@/services/location/types";
export {
  LocationError,
  isLocationError,
  locationErrorMessage,
} from "@/services/location/locationError";

/**
 * real/mock の選択。モード判定は `getLocationMode()` の1箇所に集約する
 * （他ファイルで `process.env.EXPO_PUBLIC_LOCATION_MODE` を読まない）。
 * 認証と異なり `initXxx()` のような初期化関数は不要（権限リクエストは画面側の hook が行う）。
 */
export const locationService: LocationService =
  getLocationMode() === "mock" ? createMockLocationService() : createRealLocationService();

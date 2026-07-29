import * as Location from "expo-location";

import { toLocationError } from "@/services/location/locationError";
import type {
  GeoCoordinates,
  LocationPermissionStatus,
  LocationService,
} from "@/services/location/types";

/** 直近の測位を「新しい」とみなす最大経過時間（ms）。起動時の初回描画を速くするため。 */
const LAST_KNOWN_MAX_AGE_MS = 60_000;

function toPermissionStatus(result: {
  status: Location.PermissionStatus;
  canAskAgain: boolean;
}): LocationPermissionStatus {
  if (result.status === Location.PermissionStatus.GRANTED) {
    return "granted";
  }
  return result.canAskAgain ? "undetermined" : "denied";
}

/**
 * real: `expo-location` を import してよい唯一のファイル。
 * 呼び出し側（`services/location/index.ts` 経由）はこの実装の詳細を知らない。
 */
export function createRealLocationService(): LocationService {
  return {
    async getPermissionStatus() {
      const result = await Location.getForegroundPermissionsAsync();
      return toPermissionStatus(result);
    },

    async requestPermission() {
      const result = await Location.requestForegroundPermissionsAsync();
      return toPermissionStatus(result);
    },

    async getCurrentPosition(): Promise<GeoCoordinates> {
      try {
        const lastKnown = await Location.getLastKnownPositionAsync({
          maxAge: LAST_KNOWN_MAX_AGE_MS,
        });
        if (lastKnown) {
          return { latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude };
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        return { latitude: current.coords.latitude, longitude: current.coords.longitude };
      } catch (error) {
        throw toLocationError(error);
      }
    },
  };
}

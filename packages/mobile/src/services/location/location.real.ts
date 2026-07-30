import * as Location from "expo-location";

import { toLocationError } from "@/services/location/locationError";
import type {
  GeoCoordinates,
  LocationPermissionStatus,
  LocationService,
} from "@/services/location/types";

/** 直近の測位を「新しい」とみなす最大経過時間（ms）。起動時の初回描画を速くするため。 */
const LAST_KNOWN_MAX_AGE_MS = 60_000;

/**
 * 実測時の精度。`Balanced` にしてはいけない。
 * Android では `Balanced` → `PRIORITY_BALANCED_POWER_ACCURACY` になり、fused provider が
 * GPS を起動せずネットワーク測位に頼るため、屋内やエミュレータ（"Set Location" は GPS
 * プロバイダに fix を注入する）では fix が得られず、数十秒待った末に失敗する。
 * `High` なら `PRIORITY_HIGH_ACCURACY` になり GPS を使う。徒歩ナビ用途としても妥当。
 */
const CURRENT_POSITION_ACCURACY = Location.Accuracy.High;

function toCoordinates(position: Location.LocationObject): GeoCoordinates {
  return { latitude: position.coords.latitude, longitude: position.coords.longitude };
}

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
          return toCoordinates(lastKnown);
        }

        const current = await Location.getCurrentPositionAsync({
          accuracy: CURRENT_POSITION_ACCURACY,
        });
        return toCoordinates(current);
      } catch (error) {
        // 実測に失敗しても、古くてよいので直近の測位が残っていればそれで代替する。
        // getCurrentPositionAsync は fused provider が fix を得られないと数十秒待った末に
        // CurrentLocationIsUnavailable で失敗する（屋内やエミュレータで起こりやすい）。
        // その場合でも「少し前の現在地」が取れるなら探索は始められる。
        const stale = await Location.getLastKnownPositionAsync().catch(() => null);
        if (stale) {
          return toCoordinates(stale);
        }
        throw toLocationError(error);
      }
    },
  };
}

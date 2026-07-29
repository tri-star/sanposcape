import { LocationError } from "@/services/location/locationError";
import type {
  GeoCoordinates,
  LocationErrorCode,
  LocationPermissionStatus,
  LocationService,
} from "@/services/location/types";

/** 東京駅（デフォルトのモック現在地）。 */
export const MOCK_ORIGIN: GeoCoordinates = { latitude: 35.681236, longitude: 139.767125 };

export type MockLocationServiceOptions = {
  coordinates?: GeoCoordinates;
  permission?: LocationPermissionStatus;
  /** 指定すると getCurrentPosition が必ずこのエラーを throw する（エラー系UIの確認用）。 */
  failWith?: LocationErrorCode;
};

/**
 * mock: 通信もネイティブ API も一切使わず、メモリ上の固定値で完結する（vitest / E2E 用）。
 * `expo-location` も `react-native` も import しないため `.test.ts` から直接テストできる。
 */
export function createMockLocationService(options?: MockLocationServiceOptions): LocationService {
  const coordinates = options?.coordinates ?? MOCK_ORIGIN;
  const permission = options?.permission ?? "granted";
  const failWith = options?.failWith;

  return {
    async getPermissionStatus() {
      return permission;
    },
    async requestPermission() {
      return permission;
    },
    async getCurrentPosition() {
      if (permission !== "granted") {
        throw new LocationError("permission_denied");
      }
      if (failWith) {
        throw new LocationError(failWith);
      }
      return coordinates;
    },
  };
}

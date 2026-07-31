import { LocationError } from "@/services/location/locationError";
import type {
  GeoCoordinates,
  LocationErrorCode,
  LocationPermissionStatus,
  LocationService,
  LocationSubscription,
} from "@/services/location/types";

/** 東京駅（デフォルトのモック現在地）。 */
export const MOCK_ORIGIN: GeoCoordinates = { latitude: 35.681236, longitude: 139.767125 };

/**
 * mock の移動軌跡。MOCK_ORIGIN（東京駅）から北東へおおよそ 40m ずつ 10 点進む。
 * E2E / 画面確認で「歩行距離が増えていく」ことを再現するためのスクリプト。
 */
export const MOCK_TRACK: readonly GeoCoordinates[] = [
  { latitude: 35.681236, longitude: 139.767125 },
  { latitude: 35.681506, longitude: 139.767395 },
  { latitude: 35.681776, longitude: 139.767665 },
  { latitude: 35.682046, longitude: 139.767935 },
  { latitude: 35.682316, longitude: 139.768205 },
  { latitude: 35.682586, longitude: 139.768475 },
  { latitude: 35.682856, longitude: 139.768745 },
  { latitude: 35.683126, longitude: 139.769015 },
  { latitude: 35.683396, longitude: 139.769285 },
  { latitude: 35.683666, longitude: 139.769555 },
];

/** track を1点ずつ通知する既定間隔（ms）。 */
const DEFAULT_TRACK_INTERVAL_MS = 1000;

export type MockLocationServiceOptions = {
  coordinates?: GeoCoordinates;
  permission?: LocationPermissionStatus;
  /** 指定すると getCurrentPosition が必ずこのエラーを throw する（エラー系UIの確認用）。 */
  failWith?: LocationErrorCode;
  /** watchPosition が順に通知する座標列（既定 MOCK_TRACK）。 */
  track?: readonly GeoCoordinates[];
  /** track を1点ずつ通知する間隔（ms。既定 1000）。 */
  trackIntervalMs?: number;
};

/**
 * mock: 通信もネイティブ API も一切使わず、メモリ上の固定値で完結する（vitest / E2E 用）。
 * `expo-location` も `react-native` も import しないため `.test.ts` から直接テストできる。
 */
export function createMockLocationService(options?: MockLocationServiceOptions): LocationService {
  const coordinates = options?.coordinates ?? MOCK_ORIGIN;
  const permission = options?.permission ?? "granted";
  const failWith = options?.failWith;
  const track = options?.track ?? MOCK_TRACK;
  const trackIntervalMs = options?.trackIntervalMs ?? DEFAULT_TRACK_INTERVAL_MS;

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
    async watchPosition(listener): Promise<LocationSubscription> {
      if (permission !== "granted") {
        throw new LocationError("permission_denied");
      }
      if (failWith) {
        throw new LocationError(failWith);
      }

      let index = 0;
      let removed = false;

      const interval = setInterval(() => {
        if (removed) return;
        if (index >= track.length) {
          clearInterval(interval);
          return;
        }
        listener(track[index]!);
        index += 1;
        if (index >= track.length) {
          clearInterval(interval);
        }
      }, trackIntervalMs);

      return {
        remove() {
          if (removed) return;
          removed = true;
          clearInterval(interval);
        },
      };
    },
  };
}

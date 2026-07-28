import type { LocationService } from "@/services/location/types";

/** 東京駅周辺。実機の権限設定に依存せず開発用 API 接続を確認するための固定地点。 */
export function createDevLocationService(): LocationService {
  return {
    getCurrentLocation: async () => ({ latitude: 35.681236, longitude: 139.767125 }),
  };
}

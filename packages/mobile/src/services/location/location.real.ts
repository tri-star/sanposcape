import * as ExpoLocation from "expo-location";

import {
  LocationServiceError,
  type LocationCoordinates,
  type LocationService,
} from "@/services/location/types";

export function createRealLocationService(): LocationService {
  return {
    async getCurrentLocation(): Promise<LocationCoordinates> {
      const permission = await ExpoLocation.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        throw new LocationServiceError("permission-denied");
      }

      try {
        const location = await ExpoLocation.getCurrentPositionAsync({
          accuracy: ExpoLocation.Accuracy.Balanced,
        });
        return {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
        };
      } catch {
        throw new LocationServiceError("unavailable");
      }
    },
  };
}

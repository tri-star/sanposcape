import type { LocationCoordinates, LocationService } from "@/services/location/types";

export function createMockLocationService(
  coordinates: LocationCoordinates = { latitude: 35.681236, longitude: 139.767125 },
): LocationService {
  return { getCurrentLocation: async () => coordinates };
}

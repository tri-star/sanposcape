import { createDevLocationService } from "@/services/location/location.dev";
import { createMockLocationService } from "@/services/location/location.mock";
import { createRealLocationService } from "@/services/location/location.real";
import type { LocationService } from "@/services/location/types";

export type LocationMode = "real" | "dev" | "mock";

export function getLocationMode(value = process.env.EXPO_PUBLIC_LOCATION_MODE): LocationMode {
  return value === "dev" || value === "mock" ? value : "real";
}

export function createLocationService(mode = getLocationMode()): LocationService {
  if (mode === "dev") return createDevLocationService();
  if (mode === "mock") return createMockLocationService();
  return createRealLocationService();
}

export const locationService = createLocationService();
export type { LocationCoordinates, LocationService } from "@/services/location/types";

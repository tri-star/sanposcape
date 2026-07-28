export type LocationCoordinates = {
  latitude: number;
  longitude: number;
};

export type LocationErrorCode = "permission-denied" | "unavailable";

export class LocationServiceError extends Error {
  constructor(readonly code: LocationErrorCode) {
    super(code);
    this.name = "LocationServiceError";
  }
}

export type LocationService = {
  getCurrentLocation: () => Promise<LocationCoordinates>;
};

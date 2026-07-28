import { useCallback, useEffect, useState } from "react";

import {
  LocationServiceError,
  type LocationCoordinates,
  type LocationService,
} from "@/services/location/types";

export type CurrentLocationState = {
  coordinates: LocationCoordinates | null;
  isLoading: boolean;
  error: "permission-denied" | "unavailable" | null;
  refresh: () => Promise<void>;
};

export function useCurrentLocation(service: LocationService): CurrentLocationState {
  const [coordinates, setCoordinates] = useState<LocationCoordinates | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<CurrentLocationState["error"]>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setCoordinates(await service.getCurrentLocation());
    } catch (caught) {
      setCoordinates(null);
      setError(caught instanceof LocationServiceError ? caught.code : "unavailable");
    } finally {
      setIsLoading(false);
    }
  }, [service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { coordinates, isLoading, error, refresh };
}

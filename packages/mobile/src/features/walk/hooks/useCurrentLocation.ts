import { useCallback, useEffect, useRef, useState } from "react";

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
  const requestGeneration = useRef(0);

  const refresh = useCallback(async () => {
    const generation = ++requestGeneration.current;
    setIsLoading(true);
    setError(null);
    try {
      const nextCoordinates = await service.getCurrentLocation();
      if (generation !== requestGeneration.current) return;
      setCoordinates(nextCoordinates);
    } catch (caught) {
      if (generation !== requestGeneration.current) return;
      setCoordinates(null);
      setError(caught instanceof LocationServiceError ? caught.code : "unavailable");
    } finally {
      if (generation === requestGeneration.current) setIsLoading(false);
    }
  }, [service]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { coordinates, isLoading, error, refresh };
}

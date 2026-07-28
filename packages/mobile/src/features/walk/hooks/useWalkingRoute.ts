import { useQuery } from "@tanstack/react-query";

import { fetchWalkingRoute } from "@/features/walk/api/exploreApi";
import { toWalkingRouteRequest, type ExploreSpot } from "@/features/walk/lib/exploreMapping";
import type { LocationCoordinates } from "@/services/location/types";

export function useWalkingRoute(origin: LocationCoordinates | null, spot: ExploreSpot | null) {
  const request = origin && spot ? toWalkingRouteRequest(origin, spot) : null;

  return useQuery({
    queryKey: ["walking-route", request],
    enabled: request !== null,
    queryFn: ({ signal }) => {
      if (!request) throw new Error("A selected destination is required to fetch a walking route.");
      return fetchWalkingRoute(request, signal);
    },
  });
}

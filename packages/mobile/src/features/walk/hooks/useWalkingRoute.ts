import { useQuery } from "@tanstack/react-query";

import { fetchWalkingRoute } from "@/features/walk/api/exploreApi";
import {
  toExploreRoute,
  toWalkingRouteRequest,
  type ExploreRoute,
  type ExploreSpot,
} from "@/features/walk/lib/exploreMapping";
import type { LocationCoordinates } from "@/services/location/types";

export function useWalkingRoute(origin: LocationCoordinates | null, spot: ExploreSpot | null) {
  const request = origin && spot ? toWalkingRouteRequest(origin, spot) : null;

  return useQuery<ExploreRoute>({
    queryKey: ["walking-route", request],
    enabled: request !== null,
    queryFn: async ({ signal }) => {
      if (!request) throw new Error("A selected destination is required to fetch a walking route.");
      return toExploreRoute(await fetchWalkingRoute(request, signal));
    },
  });
}

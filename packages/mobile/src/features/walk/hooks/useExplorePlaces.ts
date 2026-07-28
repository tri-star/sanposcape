import { useQuery } from "@tanstack/react-query";

import { fetchPlaces } from "@/features/walk/api/exploreApi";
import {
  toExploreSpot,
  toPlaceSearchRequest,
  type ExploreSpot,
} from "@/features/walk/lib/exploreMapping";
import type { SpotCategory } from "@/features/walk/data/types";
import type { LocationCoordinates } from "@/services/location/types";

export function useExplorePlaces(input: {
  origin: LocationCoordinates | null;
  durationMinutes: number;
  categories: readonly SpotCategory[];
}) {
  const request = input.origin
    ? toPlaceSearchRequest({
        origin: input.origin,
        durationMinutes: input.durationMinutes,
        categories: input.categories,
      })
    : null;

  return useQuery<ExploreSpot[]>({
    queryKey: ["explore-places", request],
    enabled: request !== null && request.categories.length > 0,
    queryFn: async ({ signal }) => {
      if (!request) return [];
      const response = await fetchPlaces(request, signal);
      return response.candidates.map(toExploreSpot);
    },
  });
}

import { ExploreCategory } from "@/api/generated/model/exploreCategory";
import type { PlaceCandidate } from "@/api/generated/model/placeCandidate";
import type { PlaceSearchRequest } from "@/api/generated/model/placeSearchRequest";
import type { WalkingRouteRequest } from "@/api/generated/model/walkingRouteRequest";
import type { WalkingRouteResponse } from "@/api/generated/model/walkingRouteResponse";
import type { LocationCoordinates } from "@/services/location/types";
import type { SpotCategory } from "@/features/walk/data/types";

export type ExploreSpot = {
  id: string;
  name: string;
  category: SpotCategory;
  latitude: number;
  longitude: number;
  roundTripDurationMinutes: number;
  roundTripDistanceKm: number;
};

/** 地図表示が必要とする徒歩経路の表示モデル。 */
export type ExploreRoute = {
  path: LocationCoordinates[];
  bounds: {
    southWest: LocationCoordinates;
    northEast: LocationCoordinates;
  };
};

const API_CATEGORY_BY_UI_CATEGORY: Record<
  SpotCategory,
  (typeof ExploreCategory)[keyof typeof ExploreCategory]
> = {
  konbini: ExploreCategory.convenience_store,
  super: ExploreCategory.supermarket,
  shop: ExploreCategory.retail,
  facility: ExploreCategory.facility,
  park: ExploreCategory.park,
  station: ExploreCategory.station,
};

const UI_CATEGORY_BY_API_CATEGORY: Record<
  (typeof ExploreCategory)[keyof typeof ExploreCategory],
  SpotCategory
> = {
  [ExploreCategory.convenience_store]: "konbini",
  [ExploreCategory.supermarket]: "super",
  [ExploreCategory.retail]: "shop",
  [ExploreCategory.facility]: "facility",
  [ExploreCategory.park]: "park",
  [ExploreCategory.station]: "station",
};

export function toPlaceSearchRequest(input: {
  origin: LocationCoordinates;
  durationMinutes: number;
  categories: readonly SpotCategory[];
}): PlaceSearchRequest {
  return {
    origin: input.origin,
    round_trip_duration_minutes: input.durationMinutes,
    categories: input.categories.map((category) => API_CATEGORY_BY_UI_CATEGORY[category]),
    limit: 20,
  };
}

export function toExploreSpot(candidate: PlaceCandidate): ExploreSpot {
  return {
    id: candidate.id,
    name: candidate.name,
    category: UI_CATEGORY_BY_API_CATEGORY[candidate.category],
    latitude: candidate.location.latitude,
    longitude: candidate.location.longitude,
    roundTripDurationMinutes: Math.round(candidate.round_trip_duration_seconds / 60),
    roundTripDistanceKm: candidate.round_trip_distance_meters / 1000,
  };
}

export function toWalkingRouteRequest(
  origin: LocationCoordinates,
  spot: ExploreSpot,
): WalkingRouteRequest {
  return {
    origin,
    destination: {
      place_id: spot.id,
      location: { latitude: spot.latitude, longitude: spot.longitude },
      name: spot.name,
    },
  };
}

export function toExploreRoute(route: WalkingRouteResponse): ExploreRoute {
  return {
    path: route.path.map(({ latitude, longitude }) => ({ latitude, longitude })),
    bounds: {
      southWest: {
        latitude: route.bounds.south_west.latitude,
        longitude: route.bounds.south_west.longitude,
      },
      northEast: {
        latitude: route.bounds.north_east.latitude,
        longitude: route.bounds.north_east.longitude,
      },
    },
  };
}

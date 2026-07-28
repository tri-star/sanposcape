import { describe, expect, it } from "vitest";

import { ExploreCategory } from "@/api/generated/model/exploreCategory";
import {
  toExploreSpot,
  toExploreRoute,
  toPlaceSearchRequest,
  toWalkingRouteRequest,
} from "@/features/walk/lib/exploreMapping";

describe("exploreMapping", () => {
  it("maps UI filters to the backend request contract", () => {
    expect(
      toPlaceSearchRequest({
        origin: { latitude: 35.6, longitude: 139.7 },
        durationMinutes: 60,
        categories: ["konbini", "park"],
      }),
    ).toEqual({
      origin: { latitude: 35.6, longitude: 139.7 },
      round_trip_duration_minutes: 60,
      categories: [ExploreCategory.convenience_store, ExploreCategory.park],
      limit: 20,
    });
  });

  it("converts candidate units into the UI model and route request", () => {
    const spot = toExploreSpot({
      id: "place-1",
      name: "公園",
      category: ExploreCategory.park,
      location: { latitude: 35.1, longitude: 139.1 },
      round_trip_duration_seconds: 1250,
      round_trip_distance_meters: 2300,
    });

    expect(spot).toMatchObject({
      category: "park",
      roundTripDurationMinutes: 21,
      roundTripDistanceKm: 2.3,
    });
    expect(toWalkingRouteRequest({ latitude: 35, longitude: 139 }, spot)).toEqual({
      origin: { latitude: 35, longitude: 139 },
      destination: {
        place_id: "place-1",
        location: { latitude: 35.1, longitude: 139.1 },
        name: "公園",
      },
    });
  });

  it("converts the generated walking route contract into a map display model", () => {
    expect(
      toExploreRoute({
        origin: { latitude: 35, longitude: 139 },
        destination: {
          place_id: "place-1",
          location: { latitude: 35.1, longitude: 139.1 },
          name: "公園",
        },
        duration_seconds: 600,
        distance_meters: 800,
        path: [
          { latitude: 35, longitude: 139 },
          { latitude: 35.1, longitude: 139.1 },
        ],
        bounds: {
          south_west: { latitude: 35, longitude: 139 },
          north_east: { latitude: 35.1, longitude: 139.1 },
        },
      }),
    ).toEqual({
      path: [
        { latitude: 35, longitude: 139 },
        { latitude: 35.1, longitude: 139.1 },
      ],
      bounds: {
        southWest: { latitude: 35, longitude: 139 },
        northEast: { latitude: 35.1, longitude: 139.1 },
      },
    });
  });
});

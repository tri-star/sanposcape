import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import { getGetWalkingRouteExploreRoutesWalkingMockHandler } from "@/api/generated/endpoints/explore/explore.msw";
import type { WalkingRouteRequest, WalkingRouteResponse } from "@/api/generated/model";
import { fetchWalkRoute } from "@/features/walk/api/walkRouteApi";
import { toExploreErrorCode } from "@/features/walk/lib/exploreError";
import { server } from "@/test/setup";

const REQUEST: WalkingRouteRequest = {
  origin: { latitude: 35.6812, longitude: 139.7671 },
  destination: {
    place_id: "place-1",
    location: { latitude: 35.6875, longitude: 139.7625 },
    name: "緑町公園",
  },
};

const RESPONSE: WalkingRouteResponse = {
  origin: { latitude: 35.6812, longitude: 139.7671 },
  destination: {
    place_id: "place-1",
    location: { latitude: 35.6875, longitude: 139.7625 },
    name: "緑町公園",
  },
  duration_seconds: 1200,
  distance_meters: 1600,
  path: [
    { latitude: 35.6812, longitude: 139.7671 },
    { latitude: 35.6875, longitude: 139.7625 },
  ],
  bounds: {
    north_east: { latitude: 35.6875, longitude: 139.7671 },
    south_west: { latitude: 35.6812, longitude: 139.7625 },
  },
};

describe("fetchWalkRoute", () => {
  it("200 レスポンスが WalkRoute に整形される", async () => {
    server.use(getGetWalkingRouteExploreRoutesWalkingMockHandler(RESPONSE));

    const result = await fetchWalkRoute(REQUEST);

    expect(result).toEqual({
      origin: { latitude: 35.6812, longitude: 139.7671 },
      destination: {
        placeId: "place-1",
        name: "緑町公園",
        location: { latitude: 35.6875, longitude: 139.7625 },
      },
      durationSeconds: 1200,
      distanceMeters: 1600,
      path: [
        { latitude: 35.6812, longitude: 139.7671 },
        { latitude: 35.6875, longitude: 139.7625 },
      ],
      bounds: {
        northEast: { latitude: 35.6875, longitude: 139.7671 },
        southWest: { latitude: 35.6812, longitude: 139.7625 },
      },
    });
  });

  it("送信ボディが WalkingRouteRequest として期待どおり送信される", async () => {
    let receivedBody: WalkingRouteRequest | undefined;
    server.use(
      getGetWalkingRouteExploreRoutesWalkingMockHandler(async (info) => {
        receivedBody = (await info.request.json()) as WalkingRouteRequest;
        return RESPONSE;
      }),
    );

    await fetchWalkRoute(REQUEST);

    expect(receivedBody).toEqual(REQUEST);
  });

  it("destinationName が name より優先される", async () => {
    server.use(getGetWalkingRouteExploreRoutesWalkingMockHandler(RESPONSE));

    const result = await fetchWalkRoute(REQUEST, { destinationName: "選択したスポット名" });

    expect(result.destination.name).toBe("選択したスポット名");
  });

  it("429 を返すと ApiError(429) が throw され、rate_limited に分類される", async () => {
    server.use(
      http.post("*/explore/routes/walking", () => new HttpResponse(null, { status: 429 })),
    );

    await expect(fetchWalkRoute(REQUEST)).rejects.toThrow(ApiError);

    try {
      await fetchWalkRoute(REQUEST);
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(toExploreErrorCode(error)).toBe("rate_limited");
    }
  });

  it("401（未サインイン）でもリトライせず ApiError(401) になる（呼び出し回数1）", async () => {
    let callCount = 0;
    server.use(
      http.post("*/explore/routes/walking", () => {
        callCount += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(fetchWalkRoute(REQUEST)).rejects.toThrow(ApiError);
    expect(callCount).toBe(1);
  });
});

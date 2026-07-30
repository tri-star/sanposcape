import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import { getSearchExplorePlacesMockHandler } from "@/api/generated/endpoints/explore/explore.msw";
import type { PlaceSearchRequest, PlaceSearchResponse } from "@/api/generated/model";
import { fetchSpotCandidates } from "@/features/walk/api/exploreApi";
import { toExploreErrorCode } from "@/features/walk/lib/exploreError";
import { server } from "@/test/setup";

const REQUEST: PlaceSearchRequest = {
  origin: { latitude: 35.6812, longitude: 139.7671 },
  round_trip_duration_minutes: 60,
  categories: ["convenience_store", "park"],
  limit: 20,
};

const RESPONSE: PlaceSearchResponse = {
  origin: { latitude: 35.6812, longitude: 139.7671 },
  round_trip_duration_minutes: 60,
  candidates: [
    {
      id: "place-1",
      name: "緑町公園",
      category: "park",
      location: { latitude: 35.6, longitude: 139.7 },
      round_trip_duration_seconds: 1200,
      round_trip_distance_meters: 1600,
    },
  ],
};

describe("fetchSpotCandidates", () => {
  it("SpotCandidate[] に整形される（分/km 変換込み）", async () => {
    server.use(getSearchExplorePlacesMockHandler(RESPONSE));

    const result = await fetchSpotCandidates(REQUEST);

    expect(result).toEqual([
      {
        id: "place-1",
        name: "緑町公園",
        category: "park",
        location: { latitude: 35.6, longitude: 139.7 },
        roundTripMinutes: 20,
        roundTripKm: 1.6,
      },
    ]);
  });

  it("リクエストボディが期待どおり送信される（origin丸め済み・categoriesソート済み・分/limit）", async () => {
    let receivedBody: PlaceSearchRequest | undefined;
    server.use(
      getSearchExplorePlacesMockHandler(async (info) => {
        receivedBody = (await info.request.json()) as PlaceSearchRequest;
        return RESPONSE;
      }),
    );

    await fetchSpotCandidates(REQUEST);

    expect(receivedBody).toEqual(REQUEST);
  });

  it("429 を返すと ApiError(429) が throw され、rate_limited に分類される", async () => {
    server.use(http.post("*/explore/places", () => new HttpResponse(null, { status: 429 })));

    await expect(fetchSpotCandidates(REQUEST)).rejects.toThrow(ApiError);

    try {
      await fetchSpotCandidates(REQUEST);
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(toExploreErrorCode(error)).toBe("rate_limited");
    }
  });

  it("401（未サインイン）でもリトライせず ApiError(401) になる", async () => {
    let callCount = 0;
    server.use(
      http.post("*/explore/places", () => {
        callCount += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(fetchSpotCandidates(REQUEST)).rejects.toThrow(ApiError);
    expect(callCount).toBe(1);
  });
});

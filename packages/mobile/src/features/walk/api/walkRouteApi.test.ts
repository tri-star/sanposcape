import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import type { RoundTripRouteRequest, RoundTripRouteResponse } from "@/api/generated/model";
import { fetchWalkRoute } from "@/features/walk/api/walkRouteApi";
import { toExploreErrorCode } from "@/features/walk/lib/exploreError";
import { server } from "@/test/setup";

const origin = { latitude: 35, longitude: 139 };
const goal = { latitude: 35.005, longitude: 139 };
const request: RoundTripRouteRequest = {
  origin,
  destination: { place_id: "park", name: "公園", location: goal },
  round_trip_duration_minutes: 30,
};
const response: RoundTripRouteResponse = {
  origin,
  destination: { ...request.destination, name: "公園" },
  outbound: { duration_seconds: 500, distance_meters: 600, path: [origin, goal] },
  return: {
    duration_seconds: 600,
    distance_meters: 800,
    path: [goal, { latitude: 35.003, longitude: 139.003 }, origin],
  },
  duration_seconds: 1100,
  distance_meters: 1400,
  bounds: { north_east: { latitude: 35.005, longitude: 139.003 }, south_west: origin },
};

describe("round trip route API", () => {
  it("sends the duration constraint and maps both directed legs and totals", async () => {
    server.use(
      http.post("*/explore/routes/walking/round-trip", async ({ request: req }) => {
        expect(await req.json()).toEqual(request);
        return HttpResponse.json(response);
      }),
    );
    const result = await fetchWalkRoute(request, { destinationName: "選択した公園" });
    expect(result.durationSeconds).toBe(1100);
    expect(result.distanceMeters).toBe(1400);
    expect(result.outboundPath).toEqual(response.outbound.path);
    expect(result.returnPath).toEqual(response.return.path);
    expect(result.destination.name).toBe("選択した公園");
  });
  it.each([
    [404, "round_trip_unavailable"],
    [429, "rate_limited"],
    [503, "provider_unavailable"],
  ] as const)("classifies %s without retry", async (status, expected) => {
    let calls = 0;
    server.use(
      http.post("*/explore/routes/walking/round-trip", () => {
        calls++;
        return new HttpResponse(null, { status });
      }),
    );
    try {
      await fetchWalkRoute(request);
      expect.unreachable();
    } catch (error) {
      expect(toExploreErrorCode(error)).toBe(expected);
    }
    expect(calls).toBe(1);
  });
  it("rejects missing or invalid leg data and inconsistent totals", async () => {
    for (const data of [
      { ...response, duration_seconds: 1000 },
      { ...response, return: { ...response.return, path: [] } },
    ]) {
      server.use(http.post("*/explore/routes/walking/round-trip", () => HttpResponse.json(data)));
      await expect(fetchWalkRoute(request)).rejects.toThrow();
    }
  });
});

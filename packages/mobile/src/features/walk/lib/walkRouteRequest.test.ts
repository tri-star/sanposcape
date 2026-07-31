import { describe, expect, it } from "vitest";

import {
  DESTINATION_NAME_MAX_LENGTH,
  buildWalkingRouteRequest,
} from "@/features/walk/lib/walkRouteRequest";
import type { WalkDestination } from "@/features/walk/types";

const ORIGIN = { latitude: 35.68123456, longitude: 139.76712345 };
const DESTINATION: WalkDestination = {
  placeId: "place-1",
  name: "緑町公園",
  location: { latitude: 35.68751234, longitude: 139.76251234 },
};

describe("buildWalkingRouteRequest", () => {
  it("origin が小数4桁に丸まる", () => {
    const result = buildWalkingRouteRequest({ origin: ORIGIN, destination: DESTINATION });
    expect(result?.origin).toEqual({ latitude: 35.6812, longitude: 139.7671 });
  });

  it("destination.location は丸めない", () => {
    const result = buildWalkingRouteRequest({ origin: ORIGIN, destination: DESTINATION });
    expect(result?.destination.location).toEqual(DESTINATION.location);
  });

  it("origin が null なら null", () => {
    expect(buildWalkingRouteRequest({ origin: null, destination: DESTINATION })).toBeNull();
  });

  it("destination が null なら null", () => {
    expect(buildWalkingRouteRequest({ origin: ORIGIN, destination: null })).toBeNull();
  });

  it("placeId が空文字（trim後）なら null", () => {
    const result = buildWalkingRouteRequest({
      origin: ORIGIN,
      destination: { ...DESTINATION, placeId: "   " },
    });
    expect(result).toBeNull();
  });

  it("name を trim する", () => {
    const result = buildWalkingRouteRequest({
      origin: ORIGIN,
      destination: { ...DESTINATION, name: "  緑町公園  " },
    });
    expect(result?.destination.name).toBe("緑町公園");
  });

  it("name が空（trim後）なら undefined", () => {
    const result = buildWalkingRouteRequest({
      origin: ORIGIN,
      destination: { ...DESTINATION, name: "   " },
    });
    expect(result?.destination.name).toBeUndefined();
  });

  it("name が256文字超なら切り詰める", () => {
    const longName = "あ".repeat(300);
    const result = buildWalkingRouteRequest({
      origin: ORIGIN,
      destination: { ...DESTINATION, name: longName },
    });
    expect(result?.destination.name).toHaveLength(DESTINATION_NAME_MAX_LENGTH);
  });

  it("同じ入力から同値のオブジェクトが返る（queryKey とキャッシュの安定性）", () => {
    const first = buildWalkingRouteRequest({ origin: ORIGIN, destination: DESTINATION });
    const second = buildWalkingRouteRequest({ origin: ORIGIN, destination: DESTINATION });
    expect(first).toEqual(second);
  });
});

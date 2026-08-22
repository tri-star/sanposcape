import { describe, expect, it } from "vitest";

import {
  buildReturnToStartRouteRequest,
  buildWalkingRouteRequest,
  DESTINATION_NAME_MAX_LENGTH,
  RETURN_TO_START_DESTINATION_NAME,
} from "@/features/walk/lib/walkRouteRequest";
import { resolveSpotDisplayName } from "@/features/walk/lib/spotCandidate";
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

  it("絵文字を含む長い候補名は表示名と同じ256 Unicode code pointで送信する", () => {
    const name = "😀".repeat(257);
    const result = buildWalkingRouteRequest({
      origin: ORIGIN,
      destination: { ...DESTINATION, name },
    });

    expect(result?.destination.name).toBe(resolveSpotDisplayName(name));
    expect(Array.from(result?.destination.name ?? "")).toHaveLength(DESTINATION_NAME_MAX_LENGTH);
  });

  it("極端に長い入力でも先頭256 Unicode code pointだけを送信する", () => {
    const result = buildWalkingRouteRequest({
      origin: ORIGIN,
      destination: { ...DESTINATION, name: "😀".repeat(100_000) },
    });

    expect(result?.destination.name).toBe("😀".repeat(DESTINATION_NAME_MAX_LENGTH));
  });

  it("同じ入力から同値のオブジェクトが返る（queryKey とキャッシュの安定性）", () => {
    const first = buildWalkingRouteRequest({ origin: ORIGIN, destination: DESTINATION });
    const second = buildWalkingRouteRequest({ origin: ORIGIN, destination: DESTINATION });
    expect(first).toEqual(second);
  });

  it("routeType 省略なら route_type: 'loop' が入る", () => {
    const result = buildWalkingRouteRequest({ origin: ORIGIN, destination: DESTINATION });
    expect(result?.route_type).toBe("loop");
  });

  it("routeType: 'one_way' を明示するとそのまま入る", () => {
    const result = buildWalkingRouteRequest({
      origin: ORIGIN,
      destination: DESTINATION,
      routeType: "one_way",
    });
    expect(result?.route_type).toBe("one_way");
  });
});

describe("buildReturnToStartRouteRequest", () => {
  const START = { latitude: 35.68123456, longitude: 139.76712345 };

  it("route_type: 'one_way' / destination.location = 出発地 / name: RETURN_TO_START_DESTINATION_NAME になる", () => {
    const result = buildReturnToStartRouteRequest({ origin: ORIGIN, start: START });
    expect(result?.route_type).toBe("one_way");
    expect(result?.destination.location).toEqual({ latitude: 35.6812, longitude: 139.7671 });
    expect(result?.destination.name).toBe(RETURN_TO_START_DESTINATION_NAME);
  });

  it("destination.place_id は undefined（JSON化するとキーごと落ちる。null を送らない）", () => {
    const result = buildReturnToStartRouteRequest({ origin: ORIGIN, start: START });
    expect(result?.destination.place_id).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain("place_id");
  });

  it("origin が null なら null", () => {
    expect(buildReturnToStartRouteRequest({ origin: null, start: START })).toBeNull();
  });

  it("start が null なら null", () => {
    expect(buildReturnToStartRouteRequest({ origin: ORIGIN, start: null })).toBeNull();
  });

  it("origin / start が小数4桁に丸められる", () => {
    const result = buildReturnToStartRouteRequest({ origin: ORIGIN, start: START });
    expect(result?.origin).toEqual({ latitude: 35.6812, longitude: 139.7671 });
    expect(result?.destination.location).toEqual({ latitude: 35.6812, longitude: 139.7671 });
  });
});

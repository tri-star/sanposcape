import { describe, expect, it } from "vitest";

import {
  PIN_MAP_FETCH_LIMIT,
  buildListPinsParams,
  containsBounds,
  expandBounds,
  regionToBounds,
  resolvePinFetchBounds,
  roundBoundsOutward,
} from "@/features/pin/lib/pinFetchBounds";
import type { GeoBounds } from "@/features/pin/types";
import type { MapRegion } from "@/lib/mapRegion";

const TOKYO_REGION: MapRegion = {
  latitude: 35.681236,
  longitude: 139.767125,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
};

describe("regionToBounds", () => {
  it("東京駅中心 delta 0.01 の bbox を求める", () => {
    const bounds = regionToBounds(TOKYO_REGION);
    expect(bounds.south).toBeCloseTo(35.681236 - 0.005);
    expect(bounds.north).toBeCloseTo(35.681236 + 0.005);
    expect(bounds.west).toBeCloseTo(139.767125 - 0.005);
    expect(bounds.east).toBeCloseTo(139.767125 + 0.005);
  });

  it("巨大な delta は世界の範囲にクランプする", () => {
    const bounds = regionToBounds({
      latitude: 0,
      longitude: 0,
      latitudeDelta: 200,
      longitudeDelta: 400,
    });
    expect(bounds).toEqual({ south: -90, north: 90, west: -180, east: 180 });
  });
});

describe("expandBounds", () => {
  it("幅・高さの割合ぶん余白を足す", () => {
    const base: GeoBounds = { south: 35.6, north: 35.7, west: 139.7, east: 139.8 };
    const expanded = expandBounds(base, 0.25);
    expect(expanded.south).toBeCloseTo(35.6 - 0.1 * 0.25);
    expect(expanded.north).toBeCloseTo(35.7 + 0.1 * 0.25);
    expect(expanded.west).toBeCloseTo(139.7 - 0.1 * 0.25);
    expect(expanded.east).toBeCloseTo(139.8 + 0.1 * 0.25);
  });

  it("クランプする（南極側への拡張が -90 を超えない）", () => {
    const expanded = expandBounds({ south: -89.9, north: -80, west: 0, east: 1 }, 2);
    expect(expanded.south).toBe(-90);
  });
});

describe("roundBoundsOutward", () => {
  it("south/west は切り捨て、north/east は切り上げる", () => {
    const rounded = roundBoundsOutward(
      { south: 35.68121, north: 35.68789, west: 139.76711, east: 139.77099 },
      4,
    );
    expect(rounded).toEqual({ south: 35.6812, north: 35.6879, west: 139.7671, east: 139.771 });
  });

  it("丸めた結果は必ず元の bounds を含む", () => {
    const base: GeoBounds = { south: 35.68121, north: 35.68789, west: 139.76711, east: 139.77099 };
    const rounded = roundBoundsOutward(base, 4);
    expect(containsBounds(rounded, base)).toBe(true);
  });
});

describe("containsBounds", () => {
  const outer: GeoBounds = { south: 35, north: 36, west: 139, east: 140 };

  it("境界を含む（等しい場合も true）", () => {
    expect(containsBounds(outer, outer)).toBe(true);
  });

  it("outer が inner を包含しない場合は false", () => {
    expect(containsBounds(outer, { south: 34.9, north: 35.5, west: 139, east: 140 })).toBe(false);
  });
});

describe("resolvePinFetchBounds", () => {
  it("visibleRegion が null なら current をそのまま返す", () => {
    const current: GeoBounds = { south: 35, north: 36, west: 139, east: 140 };
    expect(resolvePinFetchBounds({ visibleRegion: null, current, currentTruncated: false })).toBe(
      current,
    );
    expect(
      resolvePinFetchBounds({ visibleRegion: null, current: null, currentTruncated: false }),
    ).toBeNull();
  });

  it("current が null なら余白付きの新しい範囲を返す", () => {
    const result = resolvePinFetchBounds({
      visibleRegion: TOKYO_REGION,
      current: null,
      currentTruncated: false,
    });
    expect(result).not.toBeNull();
    expect(containsBounds(result as GeoBounds, regionToBounds(TOKYO_REGION))).toBe(true);
  });

  it("表示範囲が current に含まれる小さなパンなら同じ参照を返す", () => {
    const current = roundBoundsOutward(expandBounds(regionToBounds(TOKYO_REGION), 0.25));
    const result = resolvePinFetchBounds({
      visibleRegion: TOKYO_REGION,
      current,
      currentTruncated: false,
    });
    expect(result).toBe(current);
  });

  it("範囲外へのパンなら新しい範囲（表示範囲を含む）を返す", () => {
    const current = roundBoundsOutward(expandBounds(regionToBounds(TOKYO_REGION), 0.25));
    const pannedAway: MapRegion = { ...TOKYO_REGION, latitude: TOKYO_REGION.latitude + 1 };
    const result = resolvePinFetchBounds({
      visibleRegion: pannedAway,
      current,
      currentTruncated: false,
    });
    expect(result).not.toBe(current);
    expect(containsBounds(result as GeoBounds, regionToBounds(pannedAway))).toBe(true);
  });

  it("ズームアウトなら新しい範囲を返す", () => {
    const current = roundBoundsOutward(expandBounds(regionToBounds(TOKYO_REGION), 0.25));
    const zoomedOut: MapRegion = {
      ...TOKYO_REGION,
      latitudeDelta: 1,
      longitudeDelta: 1,
    };
    const result = resolvePinFetchBounds({
      visibleRegion: zoomedOut,
      current,
      currentTruncated: false,
    });
    expect(result).not.toBe(current);
  });

  it("拡大しても打ち切られていなければ（truncated=false）同じ参照を返す", () => {
    const current = roundBoundsOutward(expandBounds(regionToBounds(TOKYO_REGION), 0.25));
    const zoomedIn: MapRegion = { ...TOKYO_REGION, latitudeDelta: 0.001, longitudeDelta: 0.001 };
    const result = resolvePinFetchBounds({
      visibleRegion: zoomedIn,
      current,
      currentTruncated: false,
    });
    expect(result).toBe(current);
  });

  it("打ち切られている状態で表示範囲の高さが半分未満まで拡大したら取り直す", () => {
    const current = roundBoundsOutward(expandBounds(regionToBounds(TOKYO_REGION), 0.25));
    const currentHeight = current.north - current.south;
    const zoomedIn: MapRegion = {
      ...TOKYO_REGION,
      latitudeDelta: currentHeight * 0.4,
      longitudeDelta: currentHeight * 0.4,
    };
    const result = resolvePinFetchBounds({
      visibleRegion: zoomedIn,
      current,
      currentTruncated: true,
    });
    expect(result).not.toBe(current);
  });

  it("打ち切られていても半分未満まで拡大していなければ同じ参照", () => {
    const current = roundBoundsOutward(expandBounds(regionToBounds(TOKYO_REGION), 0.25));
    const currentHeight = current.north - current.south;
    const slightlyZoomedIn: MapRegion = {
      ...TOKYO_REGION,
      latitudeDelta: currentHeight * 0.8,
      longitudeDelta: currentHeight * 0.8,
    };
    const result = resolvePinFetchBounds({
      visibleRegion: slightlyZoomedIn,
      current,
      currentTruncated: true,
    });
    expect(result).toBe(current);
  });
});

describe("buildListPinsParams", () => {
  const bounds: GeoBounds = { south: 35.6, north: 35.7, west: 139.7, east: 139.8 };

  it("4つの bbox と sanpo_map_id・limit を持ち、cursor/q/tags は無い", () => {
    const params = buildListPinsParams({ sanpoMapId: "map-1", bounds });
    expect(params).toEqual({
      sanpo_map_id: "map-1",
      min_latitude: 35.6,
      min_longitude: 139.7,
      max_latitude: 35.7,
      max_longitude: 139.8,
      limit: PIN_MAP_FETCH_LIMIT,
    });
    expect("cursor" in params).toBe(false);
    expect("q" in params).toBe(false);
    expect("tags" in params).toBe(false);
  });

  it.each([
    [0, 1],
    [500, 200],
    [Number.NaN, 200],
  ])("limit %s は %s に正規化される", (input, expected) => {
    const params = buildListPinsParams({ sanpoMapId: "map-1", bounds, limit: input });
    expect(params.limit).toBe(expected);
  });
});

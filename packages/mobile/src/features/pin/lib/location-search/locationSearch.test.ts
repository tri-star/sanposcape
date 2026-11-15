import { describe, expect, it } from "vitest";

import {
  buildLocationSearchRequest,
  LOCATION_SEARCH_QUERY_MAX_LENGTH,
  locationSearchFocusRegion,
  normalizeLocationSearchQuery,
  toLocationSearchResults,
  type LocationSearchResult,
} from "@/features/pin/lib/location-search/locationSearch";

const REGION = {
  latitude: 35.68123,
  longitude: 139.76712,
  latitudeDelta: 0.01,
  longitudeDelta: 0.02,
};

describe("normalizeLocationSearchQuery", () => {
  it("前後の空白（全角を含む）を除く", () => {
    expect(normalizeLocationSearchQuery("　 コンビニ \n")).toBe("コンビニ");
  });

  it("空・空白だけなら null（送らない）", () => {
    expect(normalizeLocationSearchQuery("")).toBeNull();
    expect(normalizeLocationSearchQuery(" 　 ")).toBeNull();
  });

  it("上限（100 code point）で切る。サロゲートペアを割らない", () => {
    const long = "🍙".repeat(LOCATION_SEARCH_QUERY_MAX_LENGTH + 5);
    const normalized = normalizeLocationSearchQuery(long);
    expect(Array.from(normalized ?? "")).toHaveLength(LOCATION_SEARCH_QUERY_MAX_LENGTH);
    expect(normalized?.endsWith("🍙")).toBe(true);
  });
});

describe("buildLocationSearchRequest", () => {
  it("表示範囲を外側へ小数4桁に丸めた範囲と、整えた検索語を送る", () => {
    expect(buildLocationSearchRequest(" 新宿駅 ", REGION)).toEqual({
      query: "新宿駅",
      bounds: {
        south_west: { latitude: 35.6762, longitude: 139.7571 },
        north_east: { latitude: 35.6863, longitude: 139.7772 },
      },
    });
  });

  it("検索語が空なら null", () => {
    expect(buildLocationSearchRequest("  ", REGION)).toBeNull();
  });
});

describe("toLocationSearchResults", () => {
  it("並びを変えず、名前・住所の前後の空白を除き、空の住所は null にする", () => {
    expect(
      toLocationSearchResults({
        scope: "visible_area",
        results: [
          { id: "b", name: " B ", address: " 東京都 ", location: { latitude: 35, longitude: 139 } },
          { id: "a", name: "A", address: "  ", location: { latitude: 35.1, longitude: 139.1 } },
        ],
      }),
    ).toEqual([
      { id: "b", name: "B", address: "東京都", location: { latitude: 35, longitude: 139 } },
      { id: "a", name: "A", address: null, location: { latitude: 35.1, longitude: 139.1 } },
    ]);
  });

  it("名前が空・座標が不正な結果は落とす（地図に渡さない）", () => {
    expect(
      toLocationSearchResults({
        scope: "expanded",
        results: [
          { id: "x", name: " ", address: null, location: { latitude: 35, longitude: 139 } },
          { id: "y", name: "Y", address: null, location: { latitude: 91, longitude: 139 } },
          { id: "z", name: "Z", address: null, location: { latitude: 35, longitude: Number.NaN } },
        ],
      }),
    ).toEqual([]);
  });
});

describe("locationSearchFocusRegion", () => {
  const results: LocationSearchResult[] = [
    { id: "1", name: "1", address: null, location: { latitude: 34.7, longitude: 135.5 } },
    { id: "2", name: "2", address: null, location: { latitude: 35, longitude: 136 } },
  ];

  it("表示範囲の外まで広げて探したときは、先頭の結果の付近へ動かす", () => {
    expect(locationSearchFocusRegion(results, "expanded")).toMatchObject({
      latitude: 34.7,
      longitude: 135.5,
    });
  });

  it("表示範囲の中で見つかったときは動かさない", () => {
    expect(locationSearchFocusRegion(results, "visible_area")).toBeNull();
  });

  it("結果が無ければ動かさない", () => {
    expect(locationSearchFocusRegion([], "expanded")).toBeNull();
  });
});

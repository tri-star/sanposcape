import { describe, expect, it } from "vitest";

import {
  buildPinNewRouteParams,
  PIN_MAP_POINT_DELTA,
  PIN_PICKER_FALLBACK_REGION,
  regionAroundPoint,
  resolvePickerStartRegion,
  toPickedCoordinate,
} from "@/features/pin/lib/pinLocationPicker";
import { isValidCoordinate } from "@/lib/geoCoordinate";
import {
  parseClientWalkIdParam,
  parsePinLocationParams,
} from "@/features/pin/lib/pinLocationParams";

const TOKYO_STATION = { latitude: 35.681236, longitude: 139.767125 };

describe("regionAroundPoint", () => {
  it("既定の delta では中心 = 点、delta は PIN_MAP_POINT_DELTA になる", () => {
    expect(regionAroundPoint(TOKYO_STATION)).toEqual({
      latitude: TOKYO_STATION.latitude,
      longitude: TOKYO_STATION.longitude,
      latitudeDelta: PIN_MAP_POINT_DELTA,
      longitudeDelta: PIN_MAP_POINT_DELTA,
    });
  });

  it("delta を指定すると指定値になる", () => {
    expect(regionAroundPoint(TOKYO_STATION, 0.02)).toEqual({
      latitude: TOKYO_STATION.latitude,
      longitude: TOKYO_STATION.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    });
  });
});

describe("resolvePickerStartRegion", () => {
  it("座標が無く isLoading 中なら null（まだ地図を出さない）", () => {
    expect(resolvePickerStartRegion({ isLoading: true, coordinates: null })).toBeNull();
  });

  it("isLoading: false, coordinates が妥当なら source: current で中心 = 座標", () => {
    expect(resolvePickerStartRegion({ isLoading: false, coordinates: TOKYO_STATION })).toEqual({
      region: regionAroundPoint(TOKYO_STATION),
      source: "current",
    });
  });

  it("isLoading: true でも座標が妥当なら source: current（再試行中）", () => {
    expect(resolvePickerStartRegion({ isLoading: true, coordinates: TOKYO_STATION })).toEqual({
      region: regionAroundPoint(TOKYO_STATION),
      source: "current",
    });
  });

  it("isLoading: false, coordinates: null なら fallback", () => {
    expect(resolvePickerStartRegion({ isLoading: false, coordinates: null })).toEqual({
      region: PIN_PICKER_FALLBACK_REGION,
      source: "fallback",
    });
  });

  it("isLoading: false で座標が不正（NaN）なら fallback", () => {
    expect(
      resolvePickerStartRegion({
        isLoading: false,
        coordinates: { latitude: Number.NaN, longitude: 139 },
      }),
    ).toEqual({ region: PIN_PICKER_FALLBACK_REGION, source: "fallback" });
  });

  it("isLoading: true でも座標が不正（NaN）なら fallback にはせず null（取得中のまま扱う）", () => {
    // 不正な座標は isValidCoordinate で弾かれ current にならないため、isLoading の分岐へ落ちる。
    expect(
      resolvePickerStartRegion({
        isLoading: true,
        coordinates: { latitude: Number.NaN, longitude: 139 },
      }),
    ).toBeNull();
  });
});

describe("toPickedCoordinate", () => {
  it("妥当な座標なら同じ値の新しいオブジェクトを返す", () => {
    const raw = { latitude: 35.6, longitude: 139.7 };
    const result = toPickedCoordinate(raw);
    expect(result).toEqual(raw);
    expect(result).not.toBe(raw);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["緯度が NaN", { latitude: Number.NaN, longitude: 139 }],
    ["緯度が範囲外(91)", { latitude: 91, longitude: 139 }],
    ["経度が範囲外(181)", { latitude: 35, longitude: 181 }],
    ["経度が Infinity", { latitude: 35, longitude: Number.POSITIVE_INFINITY }],
  ])("%s は null", (_label, raw) => {
    expect(toPickedCoordinate(raw)).toBeNull();
  });
});

describe("buildPinNewRouteParams", () => {
  it("座標を latitude/longitude の文字列に変換し、clientWalkId キーを含まない", () => {
    const params = buildPinNewRouteParams(TOKYO_STATION);
    expect(params).toEqual({ latitude: "35.681236", longitude: "139.767125" });
    expect(params).not.toHaveProperty("clientWalkId");
  });

  it("高精度・負の値も丸めずに String(n) にする", () => {
    const point = { latitude: 35.12345678901, longitude: -139.987654321 };
    expect(buildPinNewRouteParams(point)).toEqual({
      latitude: String(point.latitude),
      longitude: String(point.longitude),
    });
  });

  it("parsePinLocationParams で往復すると元の座標に一致する（feature 間の暗黙の契約）", () => {
    const params = buildPinNewRouteParams(TOKYO_STATION);
    expect(parsePinLocationParams(params)).toEqual(TOKYO_STATION);
  });

  it("parseClientWalkIdParam で往復すると null（clientWalkId を含まないため）", () => {
    const params = buildPinNewRouteParams(TOKYO_STATION);
    expect(parseClientWalkIdParam(params)).toBeNull();
  });
});

describe("PIN_PICKER_FALLBACK_REGION", () => {
  it("中心は isValidCoordinate、delta は正の値", () => {
    expect(isValidCoordinate(PIN_PICKER_FALLBACK_REGION)).toBe(true);
    expect(PIN_PICKER_FALLBACK_REGION.latitudeDelta).toBeGreaterThan(0);
    expect(PIN_PICKER_FALLBACK_REGION.longitudeDelta).toBeGreaterThan(0);
  });

  // PR #102 レビュー: 旧値（中心 36.2/138.25、delta 16）は稚内・那覇・石垣・与那国が範囲外だった。
  it.each([
    ["稚内（北端付近）", 45.415, 141.673],
    ["根室（東端付近）", 43.33, 145.583],
    ["東京", 35.681, 139.767],
    ["那覇", 26.212, 127.679],
    ["石垣", 24.34, 124.156],
    ["与那国（西端付近）", 24.468, 123.004],
  ])("%s が初期表示の範囲に入る", (_label, latitude, longitude) => {
    const region = PIN_PICKER_FALLBACK_REGION;
    expect(Math.abs(latitude - region.latitude)).toBeLessThanOrEqual(region.latitudeDelta / 2);
    expect(Math.abs(longitude - region.longitude)).toBeLessThanOrEqual(region.longitudeDelta / 2);
  });
});

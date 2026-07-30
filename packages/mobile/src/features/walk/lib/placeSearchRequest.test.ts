import { describe, expect, it } from "vitest";

import {
  DURATION_MAX,
  DURATION_MIN,
  buildPlaceSearchRequest,
  clampRoundTripMinutes,
  roundCoordinate,
} from "@/features/walk/lib/placeSearchRequest";

describe("clampRoundTripMinutes", () => {
  it("最小値未満は最小値にクランプする（7→10）", () => {
    expect(clampRoundTripMinutes(7)).toBe(10);
  });

  it("最大値を超えたら最大値にクランプする（200→120）", () => {
    expect(clampRoundTripMinutes(200)).toBe(120);
  });

  it("5の倍数でなければ、最も近い5の倍数へ四捨五入する（63→65）", () => {
    expect(clampRoundTripMinutes(63)).toBe(65);
  });

  it("62 は 60 へスナップする", () => {
    expect(clampRoundTripMinutes(62)).toBe(60);
  });

  it("既に5の倍数ならそのまま", () => {
    expect(clampRoundTripMinutes(60)).toBe(60);
  });

  it("結果は常に 10..120 の範囲で 5 の倍数", () => {
    for (const value of [1, 9, 10, 33, 60, 118, 120, 121, 500]) {
      const result = clampRoundTripMinutes(value);
      expect(result).toBeGreaterThanOrEqual(DURATION_MIN);
      expect(result).toBeLessThanOrEqual(DURATION_MAX);
      expect(result % 5).toBe(0);
    }
  });
});

describe("roundCoordinate", () => {
  it("既定は小数4桁に丸める", () => {
    expect(roundCoordinate(35.6812361)).toBe(35.6812);
  });

  it("digits を指定できる", () => {
    expect(roundCoordinate(35.6812361, 2)).toBe(35.68);
  });
});

describe("buildPlaceSearchRequest", () => {
  const baseInput = {
    origin: { latitude: 35.6812361, longitude: 139.7671248 },
    durationMin: 63,
    categories: ["park", "convenience_store"] as const,
  };

  it("origin が null なら null を返す", () => {
    expect(buildPlaceSearchRequest({ ...baseInput, origin: null })).toBeNull();
  });

  it("categories が空なら null を返す", () => {
    expect(buildPlaceSearchRequest({ ...baseInput, categories: [] })).toBeNull();
  });

  it("origin を小数4桁に丸め、時間をスナップし、categories をソートする", () => {
    const request = buildPlaceSearchRequest(baseInput);
    expect(request).toEqual({
      origin: { latitude: 35.6812, longitude: 139.7671 },
      round_trip_duration_minutes: 65,
      categories: ["convenience_store", "park"],
      limit: 20,
    });
  });

  it("カテゴリの順序が違っても同一の並びになる（backend のキャッシュキーと揃えるため）", () => {
    const a = buildPlaceSearchRequest({ ...baseInput, categories: ["park", "station"] });
    const b = buildPlaceSearchRequest({ ...baseInput, categories: ["station", "park"] });
    expect(a).toEqual(b);
  });

  it("round_trip_duration_minutes は常に API 制約（10..120, 5の倍数）を満たす", () => {
    for (const durationMin of [1, 7, 63, 500]) {
      const request = buildPlaceSearchRequest({ ...baseInput, durationMin });
      expect(request?.round_trip_duration_minutes).toBeGreaterThanOrEqual(10);
      expect(request?.round_trip_duration_minutes).toBeLessThanOrEqual(120);
      expect((request?.round_trip_duration_minutes ?? 0) % 5).toBe(0);
    }
  });
});

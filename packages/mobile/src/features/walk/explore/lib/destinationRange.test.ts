import { describe, expect, it } from "vitest";

import {
  isDestinationOutOfRange,
  MAX_DESTINATION_DISTANCE_METERS,
} from "@/features/walk/explore/lib/destinationRange";

// 緯度 1 度 ≈ 111,195m（地球の半径 6,371,000m）。北へ 0.0899 度 ≈ 9,996m、0.0900 度 ≈ 10,008m。
const ORIGIN = { latitude: 35, longitude: 139 };

describe("isDestinationOutOfRange", () => {
  it("上限は 10km", () => {
    expect(MAX_DESTINATION_DISTANCE_METERS).toBe(10_000);
  });

  it("10km 未満なら範囲内", () => {
    expect(isDestinationOutOfRange(ORIGIN, { latitude: 35.0899, longitude: 139 })).toBe(false);
  });

  it("10km 以上なら範囲外", () => {
    expect(isDestinationOutOfRange(ORIGIN, { latitude: 35.09, longitude: 139 })).toBe(true);
  });

  it("同じ地点は範囲内", () => {
    expect(isDestinationOutOfRange(ORIGIN, ORIGIN)).toBe(false);
  });

  it("別の都市（東京駅→大阪駅）は範囲外", () => {
    expect(
      isDestinationOutOfRange(
        { latitude: 35.6812, longitude: 139.7671 },
        { latitude: 34.7025, longitude: 135.4959 },
      ),
    ).toBe(true);
  });

  it("現在地はルートの要求と同じく小数4桁に丸めて測る（backend と境界を揃える）", () => {
    // 丸めない現在地（35.00004）からは 0.08991 度 ≈ 9,997m で範囲内だが、
    // 送る値（35.0000）からは 0.08995 度 ≈ 10,002m で範囲外。
    expect(
      isDestinationOutOfRange(
        { latitude: 35.00004, longitude: 139 },
        { latitude: 35.08995, longitude: 139 },
      ),
    ).toBe(true);
  });
});

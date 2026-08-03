import { describe, expect, it } from "vitest";

import { isValidCoordinate } from "@/lib/geoCoordinate";

describe("isValidCoordinate", () => {
  it("通常の座標は妥当と判定する", () => {
    expect(isValidCoordinate({ latitude: 35.681236, longitude: 139.767125 })).toBe(true);
  });

  it("境界値（緯度±90度・経度±180度）は妥当と判定する", () => {
    expect(isValidCoordinate({ latitude: 90, longitude: 180 })).toBe(true);
    expect(isValidCoordinate({ latitude: -90, longitude: -180 })).toBe(true);
  });

  it("NaN の緯度・経度は不正と判定する", () => {
    expect(isValidCoordinate({ latitude: Number.NaN, longitude: 139.7 })).toBe(false);
    expect(isValidCoordinate({ latitude: 35.6, longitude: Number.NaN })).toBe(false);
  });

  it("Infinity の緯度・経度は不正と判定する", () => {
    expect(isValidCoordinate({ latitude: Number.POSITIVE_INFINITY, longitude: 139.7 })).toBe(false);
    expect(isValidCoordinate({ latitude: 35.6, longitude: Number.NEGATIVE_INFINITY })).toBe(false);
  });

  it("範囲外の緯度（±90度超）は不正と判定する", () => {
    expect(isValidCoordinate({ latitude: 91, longitude: 139.7 })).toBe(false);
    expect(isValidCoordinate({ latitude: -91, longitude: 139.7 })).toBe(false);
  });

  it("範囲外の経度（±180度超）は不正と判定する", () => {
    expect(isValidCoordinate({ latitude: 35.6, longitude: 181 })).toBe(false);
    expect(isValidCoordinate({ latitude: 35.6, longitude: -181 })).toBe(false);
  });
});

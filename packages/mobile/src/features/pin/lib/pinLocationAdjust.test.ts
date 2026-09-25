import { describe, expect, it } from "vitest";

import {
  canAdjustPinLocation,
  isSameCoordinate,
  resolveAdjustedLocation,
} from "@/features/pin/lib/pinLocationAdjust";

const ORIGIN = { latitude: 35.681236, longitude: 139.767125 };

describe("isSameCoordinate", () => {
  it("同じ値なら true", () => {
    expect(isSameCoordinate(ORIGIN, { ...ORIGIN })).toBe(true);
  });

  it("差が 4e-7（丸めると同じ）なら true", () => {
    const other = { latitude: ORIGIN.latitude + 4e-7, longitude: ORIGIN.longitude };
    expect(isSameCoordinate(ORIGIN, other)).toBe(true);
  });

  it("差が 2e-6 なら false", () => {
    const other = { latitude: ORIGIN.latitude + 2e-6, longitude: ORIGIN.longitude };
    expect(isSameCoordinate(ORIGIN, other)).toBe(false);
  });

  it("緯度は同じで経度だけ違えば false", () => {
    const other = { latitude: ORIGIN.latitude, longitude: ORIGIN.longitude + 1 };
    expect(isSameCoordinate(ORIGIN, other)).toBe(false);
  });
});

describe("resolveAdjustedLocation", () => {
  it("picked が別の位置なら isAdjusted: true", () => {
    const picked = { latitude: ORIGIN.latitude + 1, longitude: ORIGIN.longitude };
    expect(resolveAdjustedLocation({ original: ORIGIN, picked })).toEqual({
      location: picked,
      isAdjusted: true,
    });
  });

  it("picked が元と同じ（丸めると一致）なら isAdjusted: false", () => {
    const picked = { latitude: ORIGIN.latitude + 4e-7, longitude: ORIGIN.longitude };
    expect(resolveAdjustedLocation({ original: ORIGIN, picked })).toEqual({
      location: picked,
      isAdjusted: false,
    });
  });

  it("picked が不正（NaN・範囲外）なら null", () => {
    expect(
      resolveAdjustedLocation({
        original: ORIGIN,
        picked: { latitude: Number.NaN, longitude: ORIGIN.longitude },
      }),
    ).toBeNull();
    expect(
      resolveAdjustedLocation({
        original: ORIGIN,
        picked: { latitude: 91, longitude: ORIGIN.longitude },
      }),
    ).toBeNull();
  });
});

describe("canAdjustPinLocation", () => {
  it.each([
    ["idle / savedPinId: null", { saveStatus: "idle", savedPinId: null }, true],
    ["error（作成前の失敗） / savedPinId: null", { saveStatus: "error", savedPinId: null }, true],
    ["saving / savedPinId: null", { saveStatus: "saving", savedPinId: null }, false],
    ["saved / savedPinId あり", { saveStatus: "saved", savedPinId: "pin-id" }, false],
    [
      "error（写真紐付け途中の失敗） / savedPinId あり",
      { saveStatus: "error", savedPinId: "pin-id" },
      false,
    ],
    [
      "idle / savedPinId あり（通常は起きないが防御）",
      { saveStatus: "idle", savedPinId: "pin-id" },
      false,
    ],
  ] as const)("%s", (_label, input, expected) => {
    expect(canAdjustPinLocation(input)).toBe(expected);
  });
});

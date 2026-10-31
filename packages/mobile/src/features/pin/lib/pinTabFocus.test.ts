import { describe, expect, it } from "vitest";

import {
  buildPinTabFocusParams,
  canMoveToPinOnPinTab,
  parsePinTabFocusParams,
} from "@/features/pin/lib/pinTabFocus";

describe("buildPinTabFocusParams / parsePinTabFocusParams", () => {
  it("作ったパラメータをそのまま読める", () => {
    const params = buildPinTabFocusParams(
      { latitude: 35.6717, longitude: 139.6949 },
      "1730250000000",
    );
    expect(parsePinTabFocusParams(params)).toEqual({
      target: { latitude: 35.6717, longitude: 139.6949 },
      key: "1730250000000",
    });
  });

  it("focusKey が無い・空・配列なら null（ピンタブを普通に開いたとき）", () => {
    const location = { latitude: "35.6717", longitude: "139.6949" };
    expect(parsePinTabFocusParams(location)).toBeNull();
    expect(parsePinTabFocusParams({ ...location, focusKey: " " })).toBeNull();
    expect(parsePinTabFocusParams({ ...location, focusKey: ["a", "b"] })).toBeNull();
  });

  it("座標が不正なら null", () => {
    expect(
      parsePinTabFocusParams({ latitude: "abc", longitude: "139.6949", focusKey: "k" }),
    ).toBeNull();
    expect(
      parsePinTabFocusParams({ latitude: "91", longitude: "139.6949", focusKey: "k" }),
    ).toBeNull();
    expect(parsePinTabFocusParams({ longitude: "139.6949", focusKey: "k" })).toBeNull();
  });
});

describe("canMoveToPinOnPinTab", () => {
  it("アーカイブ済みのピンはピンタブの地図に出ないので false", () => {
    expect(canMoveToPinOnPinTab({ archived: false })).toBe(true);
    expect(canMoveToPinOnPinTab({ archived: true })).toBe(false);
  });
});

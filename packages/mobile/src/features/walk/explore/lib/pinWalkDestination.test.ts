import { describe, expect, it } from "vitest";

import {
  buildPinWalkStartParams,
  parsePinWalkStartParams,
  PIN_DESTINATION_PLACE_ID_PREFIX,
} from "@/features/walk/explore/lib/pinWalkDestination";

const PIN_ID = "3f1e2d4c-5b6a-4978-8a9b-0c1d2e3f4a5b";

const validParams = {
  pinId: PIN_ID,
  latitude: "35.6812",
  longitude: "139.7671",
  name: "駅前のパン屋",
};

describe("buildPinWalkStartParams", () => {
  it("ピンの id・座標・名前を文字列のパラメータにする", () => {
    expect(
      buildPinWalkStartParams({
        id: PIN_ID,
        name: "駅前のパン屋",
        location: { latitude: 35.6812, longitude: 139.7671 },
      }),
    ).toEqual(validParams);
  });

  it("作ったパラメータを parse すると同じ座標・名前の目的地に戻る", () => {
    const location = { latitude: 35.681236, longitude: 139.767125 };
    const destination = parsePinWalkStartParams(
      buildPinWalkStartParams({ id: PIN_ID, name: "公園", location }),
    );
    expect(destination).toEqual({
      placeId: `${PIN_DESTINATION_PLACE_ID_PREFIX}${PIN_ID}`,
      name: "公園",
      location,
    });
  });
});

describe("parsePinWalkStartParams", () => {
  it("place id は pin: の接頭辞にピンの id を付けたもの", () => {
    expect(parsePinWalkStartParams(validParams)?.placeId).toBe(`pin:${PIN_ID}`);
  });

  it("パラメータが無い（通常の散歩開始）なら null", () => {
    expect(parsePinWalkStartParams({})).toBeNull();
  });

  it.each([
    ["UUID でない", { pinId: "../walks" }],
    ["pinId が配列", { pinId: [PIN_ID, PIN_ID] }],
    ["緯度が無い", { latitude: undefined }],
    ["緯度が空白だけ", { latitude: " " }],
    ["経度が数値でない", { longitude: "abc" }],
    ["緯度が範囲外", { latitude: "91" }],
    ["経度が Infinity", { longitude: "Infinity" }],
    ["座標が配列", { latitude: ["35", "36"] }],
  ])("%s なら null", (_label, override) => {
    expect(parsePinWalkStartParams({ ...validParams, ...override })).toBeNull();
  });

  it.each([
    ["無い", undefined],
    ["空白だけ", "  "],
    ["配列", ["a", "b"]],
  ])("名前が %s なら「目的地」にする", (_label, name) => {
    expect(parsePinWalkStartParams({ ...validParams, name })?.name).toBe("目的地");
  });

  it("名前は前後の空白を除き、256 code point に切り詰める", () => {
    expect(parsePinWalkStartParams({ ...validParams, name: "  公園  " })?.name).toBe("公園");
    const long = "🌸".repeat(300);
    expect(
      Array.from(parsePinWalkStartParams({ ...validParams, name: long })?.name ?? ""),
    ).toHaveLength(256);
  });
});

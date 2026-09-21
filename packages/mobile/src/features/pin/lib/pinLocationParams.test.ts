import { describe, expect, it } from "vitest";

import { resolveAddPinAction } from "@/features/walk/lib/addPinAction";
import {
  parseClientWalkIdParam,
  parsePinLocationParams,
} from "@/features/pin/lib/pinLocationParams";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("parsePinLocationParams", () => {
  it("正常値をパースできる", () => {
    expect(parsePinLocationParams({ latitude: "35.681236", longitude: "139.767125" })).toEqual({
      latitude: 35.681236,
      longitude: 139.767125,
    });
  });

  it.each([
    ["latitude が配列", { latitude: ["1", "2"], longitude: "1" }],
    ["longitude が配列", { latitude: "1", longitude: ["1", "2"] }],
    ["latitude が空文字", { latitude: "", longitude: "1" }],
    ["latitude が非数値", { latitude: "abc", longitude: "1" }],
    ["latitude が範囲外(91)", { latitude: "91", longitude: "1" }],
    ["longitude が Infinity", { latitude: "1", longitude: "Infinity" }],
    ["両方未指定", {}],
  ])("%s は null", (_label, params) => {
    expect(parsePinLocationParams(params)).toBeNull();
  });

  it("walk 側 resolveAddPinAction が組み立てる形をそのまま parse できる", () => {
    const action = resolveAddPinAction({
      featureEnabled: true,
      currentPosition: { latitude: 35.681236, longitude: 139.767125 },
      clientWalkId: VALID_UUID,
    });
    expect(action.type).toBe("navigate");
    if (action.type !== "navigate") throw new Error("unreachable");

    expect(parsePinLocationParams(action.params)).toEqual({
      latitude: 35.681236,
      longitude: 139.767125,
    });
    expect(parseClientWalkIdParam(action.params)).toBe(VALID_UUID);
  });
});

describe("parseClientWalkIdParam", () => {
  it("UUID 形式なら値を返す", () => {
    expect(parseClientWalkIdParam({ clientWalkId: VALID_UUID })).toBe(VALID_UUID);
  });

  it.each([
    ["未指定", {}],
    ["配列", { clientWalkId: [VALID_UUID, VALID_UUID] }],
    ["非UUID", { clientWalkId: "not-a-uuid" }],
  ])("%s は null", (_label, params) => {
    expect(parseClientWalkIdParam(params)).toBeNull();
  });
});

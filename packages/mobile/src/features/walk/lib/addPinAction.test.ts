import { describe, expect, it } from "vitest";

import { resolveAddPinAction } from "@/features/walk/lib/addPinAction";

const POSITION = { latitude: 35.681236, longitude: 139.767125 };

describe("resolveAddPinAction", () => {
  it("フラグ OFF は位置の有無に関係なく toast", () => {
    expect(
      resolveAddPinAction({ featureEnabled: false, currentPosition: POSITION, clientWalkId: null }),
    ).toEqual({
      type: "toast",
      message: "準備中の機能です",
    });
    expect(
      resolveAddPinAction({ featureEnabled: false, currentPosition: null, clientWalkId: null }),
    ).toEqual({
      type: "toast",
      message: "準備中の機能です",
    });
  });

  it("フラグ ON かつ現在地なしは toast", () => {
    expect(
      resolveAddPinAction({ featureEnabled: true, currentPosition: null, clientWalkId: null }),
    ).toEqual({
      type: "toast",
      message: "現在地を取得できるまでお待ちください",
    });
  });

  it("フラグ ON かつ現在地が不正（NaN）は toast", () => {
    expect(
      resolveAddPinAction({
        featureEnabled: true,
        currentPosition: { latitude: Number.NaN, longitude: 0 },
        clientWalkId: null,
      }),
    ).toEqual({ type: "toast", message: "現在地を取得できるまでお待ちください" });
  });

  it("フラグ ON かつ現在地が正常なら navigate（clientWalkId なし）", () => {
    const action = resolveAddPinAction({
      featureEnabled: true,
      currentPosition: POSITION,
      clientWalkId: null,
    });
    expect(action).toEqual({
      type: "navigate",
      params: { latitude: "35.681236", longitude: "139.767125" },
    });
  });

  it("clientWalkId ありなら params に含める", () => {
    const action = resolveAddPinAction({
      featureEnabled: true,
      currentPosition: POSITION,
      clientWalkId: "11111111-1111-4111-8111-111111111111",
    });
    expect(action).toEqual({
      type: "navigate",
      params: {
        latitude: "35.681236",
        longitude: "139.767125",
        clientWalkId: "11111111-1111-4111-8111-111111111111",
      },
    });
  });
});

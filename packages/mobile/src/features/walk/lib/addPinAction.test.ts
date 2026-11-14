import { describe, expect, it } from "vitest";

import {
  resolveAddPinAction,
  resolveMapLongPressPinAction,
} from "@/features/walk/lib/addPinAction";

const POSITION = { latitude: 35.681236, longitude: 139.767125 };

describe("resolveAddPinAction", () => {
  it("現在地なしは toast", () => {
    expect(resolveAddPinAction({ currentPosition: null, clientWalkId: null })).toEqual({
      type: "toast",
      message: "現在地を取得できるまでお待ちください",
    });
  });

  it("現在地が不正（NaN）は toast", () => {
    expect(
      resolveAddPinAction({
        currentPosition: { latitude: Number.NaN, longitude: 0 },
        clientWalkId: null,
      }),
    ).toEqual({ type: "toast", message: "現在地を取得できるまでお待ちください" });
  });

  it("現在地が正常なら navigate（clientWalkId なし）", () => {
    const action = resolveAddPinAction({
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

describe("resolveMapLongPressPinAction", () => {
  const WALK_ID = "11111111-1111-4111-8111-111111111111";

  it.each([
    ["null", null],
    ["NaN", { latitude: Number.NaN, longitude: 0 }],
    ["緯度が範囲外", { latitude: 91, longitude: 0 }],
    ["経度が範囲外", { latitude: 0, longitude: 181 }],
  ])("座標が %s なら何もしない", (_label, pressedPosition) => {
    expect(
      resolveMapLongPressPinAction({
        pressedPosition,
        clientWalkId: WALK_ID,
      }),
    ).toBeNull();
  });

  it("長押しした地点と clientWalkId で navigate する", () => {
    expect(
      resolveMapLongPressPinAction({
        pressedPosition: POSITION,
        clientWalkId: WALK_ID,
      }),
    ).toEqual({
      type: "navigate",
      params: { latitude: "35.681236", longitude: "139.767125", clientWalkId: WALK_ID },
    });
  });

  it("clientWalkId が無ければ params に含めない", () => {
    expect(
      resolveMapLongPressPinAction({
        pressedPosition: POSITION,
        clientWalkId: null,
      }),
    ).toEqual({ type: "navigate", params: { latitude: "35.681236", longitude: "139.767125" } });
  });
});

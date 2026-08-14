import { describe, expect, it } from "vitest";

import {
  type WalkSaveFireInput,
  nextWalkSaveFireKey,
  walkSaveFireKey,
} from "@/features/walk/lib/walkSaveTrigger";

describe("walkSaveFireKey", () => {
  it("同じ入力からは同じキーを返す", () => {
    expect(walkSaveFireKey("walk-1", false)).toBe(walkSaveFireKey("walk-1", false));
  });

  it("isSignedIn が違えば別キーになる", () => {
    expect(walkSaveFireKey("walk-1", false)).not.toBe(walkSaveFireKey("walk-1", true));
  });
});

describe("nextWalkSaveFireKey", () => {
  const base: WalkSaveFireInput = {
    clientWalkId: "walk-1",
    saved: false,
    isSignedIn: false,
    lastFiredKey: null,
  };

  it("ドラフト無しなら発火しない", () => {
    expect(nextWalkSaveFireKey({ ...base, clientWalkId: null })).toBeNull();
  });

  it("保存済みなら発火しない", () => {
    expect(nextWalkSaveFireKey({ ...base, saved: true })).toBeNull();
  });

  it("初回（ゲスト）は発火する", () => {
    expect(nextWalkSaveFireKey({ ...base, lastFiredKey: null, isSignedIn: false })).toBe(
      "walk-1:guest",
    );
  });

  it("初回（認証済み）は発火する", () => {
    expect(nextWalkSaveFireKey({ ...base, lastFiredKey: null, isSignedIn: true })).toBe(
      "walk-1:signed-in",
    );
  });

  it("同一状態での再評価では二重発火しない", () => {
    expect(
      nextWalkSaveFireKey({ ...base, lastFiredKey: "walk-1:guest", isSignedIn: false }),
    ).toBeNull();
  });

  it("サインイン後は再送のため発火する", () => {
    expect(nextWalkSaveFireKey({ ...base, lastFiredKey: "walk-1:guest", isSignedIn: true })).toBe(
      "walk-1:signed-in",
    );
  });

  it("セッション喪失後（signed-in → guest）も発火する（挙動を固定）", () => {
    expect(
      nextWalkSaveFireKey({ ...base, lastFiredKey: "walk-1:signed-in", isSignedIn: false }),
    ).toBe("walk-1:guest");
  });

  it("別ドラフトに差し替わった場合は発火する", () => {
    expect(
      nextWalkSaveFireKey({
        ...base,
        clientWalkId: "walk-2",
        lastFiredKey: "walk-1:guest",
        isSignedIn: false,
      }),
    ).toBe("walk-2:guest");
  });

  it("saved は他条件より優先される", () => {
    expect(nextWalkSaveFireKey({ ...base, saved: true, lastFiredKey: null })).toBeNull();
  });
});

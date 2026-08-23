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
    signInForSaveRequested: false,
  };

  it("ドラフト無しなら発火しない", () => {
    expect(nextWalkSaveFireKey({ ...base, clientWalkId: null })).toBeNull();
  });

  it("保存済みなら発火しない", () => {
    expect(nextWalkSaveFireKey({ ...base, saved: true })).toBeNull();
  });

  it("初回（ゲスト）は intent 無しでも発火する（従来どおり無条件。SS-37 ローカルレビュー対応）", () => {
    expect(
      nextWalkSaveFireKey({
        ...base,
        lastFiredKey: null,
        isSignedIn: false,
        signInForSaveRequested: false,
      }),
    ).toBe("walk-1:guest");
  });

  it("初回（認証済み）は intent 無しでも発火する（サインイン済みユーザーの通常ケース）", () => {
    expect(
      nextWalkSaveFireKey({
        ...base,
        lastFiredKey: null,
        isSignedIn: true,
        signInForSaveRequested: false,
      }),
    ).toBe("walk-1:signed-in");
  });

  it("同一状態での再評価では二重発火しない", () => {
    expect(
      nextWalkSaveFireKey({ ...base, lastFiredKey: "walk-1:guest", isSignedIn: false }),
    ).toBeNull();
  });

  it("guest→signed-in は intent 有りでのみ発火する（サマリのCTAから来た場合。SS-37 ローカルレビュー対応）", () => {
    expect(
      nextWalkSaveFireKey({
        ...base,
        lastFiredKey: "walk-1:guest",
        isSignedIn: true,
        signInForSaveRequested: true,
      }),
    ).toBe("walk-1:signed-in");
  });

  it("intent 無しの guest→signed-in では発火しない（無関係なサインインへの安全策。SS-37 ローカルレビュー対応）", () => {
    expect(
      nextWalkSaveFireKey({
        ...base,
        lastFiredKey: "walk-1:guest",
        isSignedIn: true,
        signInForSaveRequested: false,
      }),
    ).toBeNull();
  });

  it("セッション喪失後（signed-in → guest）は intent が無ければ発火しない（実際には到達しないパスだが、意思表示ゲートでも二重に守られる）", () => {
    expect(
      nextWalkSaveFireKey({
        ...base,
        lastFiredKey: "walk-1:signed-in",
        isSignedIn: false,
        signInForSaveRequested: false,
      }),
    ).toBeNull();
  });

  it("別ドラフトに差し替わった場合は intent 無しでも発火する（新しいドラフトの初回発火に相当するため）", () => {
    expect(
      nextWalkSaveFireKey({
        ...base,
        clientWalkId: "walk-2",
        lastFiredKey: "walk-1:guest",
        isSignedIn: false,
        signInForSaveRequested: false,
      }),
    ).toBe("walk-2:guest");
  });

  it("saved は他条件より優先される", () => {
    expect(nextWalkSaveFireKey({ ...base, saved: true, lastFiredKey: null })).toBeNull();
  });
});

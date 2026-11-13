import { describe, expect, it } from "vitest";

import { resolveHistoryListBodyState } from "./historyListBodyState";

const SIGNED_IN = {
  authState: "signed-in" as const,
  errorCode: null,
  isLoading: false,
  itemCount: 3,
};

describe("resolveHistoryListBodyState", () => {
  it.each([
    { errorCode: null, isLoading: true, itemCount: 0 },
    { errorCode: "unauthorized" as const, isLoading: false, itemCount: 0 },
    { errorCode: null, isLoading: false, itemCount: 3 },
  ])("復元中は常に restoring（%o）", (input) => {
    expect(resolveHistoryListBodyState({ ...input, authState: "restoring" })).toEqual({
      kind: "restoring",
    });
  });

  it.each([
    // 無効化した query はデータが無いと isPending のまま（永久に loading にならないこと）
    { errorCode: null, isLoading: true, itemCount: 0 },
    { errorCode: "unauthorized" as const, isLoading: false, itemCount: 0 },
    { errorCode: null, isLoading: false, itemCount: 3 },
  ])("ゲストは常に sign-in-required（%o）", (input) => {
    expect(resolveHistoryListBodyState({ ...input, authState: "guest" })).toEqual({
      kind: "sign-in-required",
    });
  });

  it("サインイン済みでエラーがあれば error（読み込み中より先）", () => {
    expect(
      resolveHistoryListBodyState({ ...SIGNED_IN, errorCode: "server", isLoading: true }),
    ).toEqual({ kind: "error", errorCode: "server" });
  });

  it("サインイン済みで読み込み中なら loading", () => {
    expect(resolveHistoryListBodyState({ ...SIGNED_IN, isLoading: true, itemCount: 0 })).toEqual({
      kind: "loading",
    });
  });

  it("サインイン済みで0件なら empty", () => {
    expect(resolveHistoryListBodyState({ ...SIGNED_IN, itemCount: 0 })).toEqual({ kind: "empty" });
  });

  it("サインイン済みで1件以上なら ready", () => {
    expect(resolveHistoryListBodyState(SIGNED_IN)).toEqual({ kind: "ready" });
  });
});

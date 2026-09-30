import { describe, expect, it } from "vitest";

import {
  HISTORY_SIGN_IN_DESCRIPTION,
  HISTORY_SIGN_IN_TITLE,
  resolveHistoryStatsState,
} from "./historyStatsState";

describe("resolveHistoryStatsState", () => {
  it.each([
    { errorCode: null, isLoading: false },
    { errorCode: null, isLoading: true },
    { errorCode: "unauthorized" as const, isLoading: false },
    { errorCode: "server" as const, isLoading: true },
  ])("ゲストは常に sign-in-required（%o）", ({ errorCode, isLoading }) => {
    expect(resolveHistoryStatsState({ authState: "guest", errorCode, isLoading })).toEqual({
      kind: "sign-in-required",
    });
  });

  it.each([
    { errorCode: null, isLoading: false },
    { errorCode: null, isLoading: true },
    { errorCode: "unauthorized" as const, isLoading: false },
    { errorCode: "server" as const, isLoading: true },
  ])("復元中は常に restoring（サインイン案内にしない。%o）", ({ errorCode, isLoading }) => {
    expect(resolveHistoryStatsState({ authState: "restoring", errorCode, isLoading })).toEqual({
      kind: "restoring",
    });
  });

  it("サインイン中: errorCode があれば error（isLoading が true でも勝つ）", () => {
    expect(
      resolveHistoryStatsState({ authState: "signed-in", errorCode: "network", isLoading: true }),
    ).toEqual({ kind: "error", errorCode: "network" });
  });

  it("サインイン中: errorCode なし・取得中は loading", () => {
    expect(
      resolveHistoryStatsState({ authState: "signed-in", errorCode: null, isLoading: true }),
    ).toEqual({
      kind: "loading",
    });
  });

  it("サインイン中: どちらもなければ ready", () => {
    expect(
      resolveHistoryStatsState({ authState: "signed-in", errorCode: null, isLoading: false }),
    ).toEqual({
      kind: "ready",
    });
  });
});

describe("ゲスト向け文言", () => {
  it("空でない", () => {
    expect(HISTORY_SIGN_IN_TITLE).not.toBe("");
    expect(HISTORY_SIGN_IN_DESCRIPTION).not.toBe("");
  });
});

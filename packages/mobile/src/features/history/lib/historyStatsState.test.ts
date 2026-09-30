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
    expect(resolveHistoryStatsState({ isSignedIn: false, errorCode, isLoading })).toBe(
      "sign-in-required",
    );
  });

  it("サインイン中: errorCode があれば error（isLoading が true でも勝つ）", () => {
    expect(
      resolveHistoryStatsState({ isSignedIn: true, errorCode: "network", isLoading: true }),
    ).toBe("error");
  });

  it("サインイン中: errorCode なし・取得中は loading", () => {
    expect(resolveHistoryStatsState({ isSignedIn: true, errorCode: null, isLoading: true })).toBe(
      "loading",
    );
  });

  it("サインイン中: どちらもなければ ready", () => {
    expect(resolveHistoryStatsState({ isSignedIn: true, errorCode: null, isLoading: false })).toBe(
      "ready",
    );
  });
});

describe("ゲスト向け文言", () => {
  it("空でない", () => {
    expect(HISTORY_SIGN_IN_TITLE).not.toBe("");
    expect(HISTORY_SIGN_IN_DESCRIPTION).not.toBe("");
  });
});

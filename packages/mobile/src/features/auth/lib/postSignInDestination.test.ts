import { describe, expect, it } from "vitest";

import { getPostSignInDestination } from "@/features/auth/lib/postSignInDestination";

describe("getPostSignInDestination", () => {
  it("進行中の散歩が無ければ散歩開始画面（計画画面）へ送る", () => {
    expect(getPostSignInDestination(false)).toBe("/walk-start");
  });

  it("進行中の散歩があれば /(tabs) へ戻す（無警告での上書きを防ぐ。SS-57 ローカルレビュー対応）", () => {
    expect(getPostSignInDestination(true)).toBe("/(tabs)");
  });
});

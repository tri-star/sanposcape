import { describe, expect, it } from "vitest";

import { getPostSignInDestination } from "@/features/auth/lib/postSignInDestination";

describe("getPostSignInDestination", () => {
  it("進行中の散歩・保存待ちドラフトのいずれも無ければ散歩開始画面（計画画面）へ replace する", () => {
    expect(
      getPostSignInDestination({ hasActiveWalk: false, hasUnsavedFinishedWalk: false }),
    ).toEqual({ type: "replace", href: "/walk-start" });
  });

  it("進行中の散歩があれば /(tabs) へ replace する（無警告での上書きを防ぐ。SS-57 ローカルレビュー対応）", () => {
    expect(
      getPostSignInDestination({ hasActiveWalk: true, hasUnsavedFinishedWalk: false }),
    ).toEqual({ type: "replace", href: "/(tabs)" });
  });

  it("保存待ちドラフトがあればサマリ画面へ dismissTo する（SS-37）", () => {
    expect(
      getPostSignInDestination({ hasActiveWalk: false, hasUnsavedFinishedWalk: true }),
    ).toEqual({ type: "dismissTo", href: "/walk-summary" });
  });

  it("進行中の散歩と保存待ちドラフトが両方あれば進行中の散歩を優先する", () => {
    expect(getPostSignInDestination({ hasActiveWalk: true, hasUnsavedFinishedWalk: true })).toEqual(
      { type: "replace", href: "/(tabs)" },
    );
  });
});

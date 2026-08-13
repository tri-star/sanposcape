import { describe, expect, it } from "vitest";

import { getSplashDestination } from "@/features/auth/lib/splashDestination";

describe("getSplashDestination", () => {
  it("authenticated の場合は散歩開始画面へ遷移する", () => {
    expect(getSplashDestination("authenticated")).toBe("/walk-start");
  });

  it("guest はゲートを通れるようになった後もサインイン画面へ送る（ゲスト導線の入口を必ず見せる。SS-57）", () => {
    expect(getSplashDestination("guest")).toBe("/(auth)/sign-in");
  });
});

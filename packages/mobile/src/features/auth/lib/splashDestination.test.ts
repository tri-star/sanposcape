import { describe, expect, it } from "vitest";

import { getSplashDestination } from "@/features/auth/lib/splashDestination";

describe("getSplashDestination", () => {
  it("authenticated の場合は散歩開始画面へ遷移する", () => {
    expect(getSplashDestination("authenticated")).toBe("/walk-start");
  });

  it("guest の場合はサインイン画面へ遷移する", () => {
    expect(getSplashDestination("guest")).toBe("/(auth)/sign-in");
  });
});

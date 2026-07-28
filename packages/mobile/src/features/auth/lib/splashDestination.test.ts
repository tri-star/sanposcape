import { describe, expect, it } from "vitest";

import { getSplashDestination } from "@/features/auth/lib/splashDestination";

describe("getSplashDestination", () => {
  it("復元したユーザーがある場合は散歩開始画面へ遷移する", () => {
    expect(
      getSplashDestination({
        id: "user-1",
        email: "user@example.com",
        displayName: "散歩ユーザー",
        photoUrl: null,
      }),
    ).toBe("/walk-start");
  });

  it("復元したユーザーがない場合はサインイン画面へ遷移する", () => {
    expect(getSplashDestination(null)).toBe("/(auth)/sign-in");
  });
});

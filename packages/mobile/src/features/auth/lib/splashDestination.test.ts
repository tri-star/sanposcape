import { describe, expect, it } from "vitest";

import { getSplashDestination } from "@/features/auth/lib/splashDestination";

describe("getSplashDestination", () => {
  it("authenticated の場合はピンタブへ遷移する（SS-145）", () => {
    expect(getSplashDestination("authenticated")).toBe("/(tabs)/pins");
  });

  it("guest はゲートを通れるようになった後もサインイン画面へ送る（ゲスト導線の入口を必ず見せる。SS-57）", () => {
    expect(getSplashDestination("guest")).toBe("/(auth)/sign-in");
  });
});

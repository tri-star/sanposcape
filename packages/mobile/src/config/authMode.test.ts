import { afterEach, describe, expect, it, vi } from "vitest";

import { getAuthMode, parseAuthMode } from "@/config/authMode";

describe("parseAuthMode", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["空文字", ""],
    ["旧値 stub", "stub"],
    ["大文字 REAL", "REAL"],
    ["任意の文字列", "foo"],
  ])("%s は real にフォールバックする", (_label, raw) => {
    expect(parseAuthMode(raw)).toBe("real");
  });

  it('"dev" は dev になる', () => {
    expect(parseAuthMode("dev")).toBe("dev");
  });

  it('"mock" は mock になる', () => {
    expect(parseAuthMode("mock")).toBe("mock");
  });

  it("前後の空白は trim される", () => {
    expect(parseAuthMode(" dev ")).toBe("dev");
  });
});

describe("getAuthMode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("EXPO_PUBLIC_AUTH_MODE=dev のとき dev を返す", () => {
    vi.stubEnv("EXPO_PUBLIC_AUTH_MODE", "dev");

    expect(getAuthMode()).toBe("dev");
  });

  it("EXPO_PUBLIC_AUTH_MODE 未設定のとき real を返す", () => {
    vi.stubEnv("EXPO_PUBLIC_AUTH_MODE", "");

    expect(getAuthMode()).toBe("real");
  });

  it("EXPO_PUBLIC_AUTH_MODE=stub（旧値）のとき real にフォールバックする", () => {
    vi.stubEnv("EXPO_PUBLIC_AUTH_MODE", "stub");

    expect(getAuthMode()).toBe("real");
  });
});

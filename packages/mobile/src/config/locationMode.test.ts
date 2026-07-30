import { afterEach, describe, expect, it, vi } from "vitest";

import { getLocationMode, parseLocationMode } from "@/config/locationMode";

describe("parseLocationMode", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["空文字", ""],
    ["大文字 MOCK", "MOCK"],
    ["real", "real"],
    ["dev", "dev"],
    ["任意の文字列", "foo"],
  ])("%s は real にフォールバックする", (_label, raw) => {
    expect(parseLocationMode(raw)).toBe("real");
  });

  it('"mock" は mock になる', () => {
    expect(parseLocationMode("mock")).toBe("mock");
  });

  it("前後の空白は trim される", () => {
    expect(parseLocationMode(" mock ")).toBe("mock");
  });
});

describe("getLocationMode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("EXPO_PUBLIC_LOCATION_MODE=mock のとき mock を返す", () => {
    vi.stubEnv("EXPO_PUBLIC_LOCATION_MODE", "mock");

    expect(getLocationMode()).toBe("mock");
  });

  it("EXPO_PUBLIC_LOCATION_MODE 未設定のとき real を返す", () => {
    vi.stubEnv("EXPO_PUBLIC_LOCATION_MODE", "");

    expect(getLocationMode()).toBe("real");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

import { getPhotoMode, parsePhotoMode } from "@/config/photoMode";

describe("parsePhotoMode", () => {
  it.each([
    ["undefined", undefined],
    ["null", null],
    ["空文字", ""],
    ["大文字 MOCK", "MOCK"],
    ["real", "real"],
    ["dev", "dev"],
    ["任意の文字列", "foo"],
  ])("%s は real にフォールバックする", (_label, raw) => {
    expect(parsePhotoMode(raw)).toBe("real");
  });

  it('"mock" は mock になる', () => {
    expect(parsePhotoMode("mock")).toBe("mock");
  });

  it("前後の空白は trim される", () => {
    expect(parsePhotoMode(" mock ")).toBe("mock");
  });
});

describe("getPhotoMode", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("EXPO_PUBLIC_PHOTO_MODE=mock のとき mock を返す", () => {
    vi.stubEnv("EXPO_PUBLIC_PHOTO_MODE", "mock");

    expect(getPhotoMode()).toBe("mock");
  });

  it("EXPO_PUBLIC_PHOTO_MODE 未設定のとき real を返す", () => {
    vi.stubEnv("EXPO_PUBLIC_PHOTO_MODE", "");

    expect(getPhotoMode()).toBe("real");
  });
});

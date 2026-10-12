import { describe, expect, it } from "vitest";

import {
  APPLE_DISPLAY_NAME_MAX_LENGTH,
  hasAnyNameComponent,
  joinNameComponents,
  parsePendingAppleDisplayName,
  sanitizeAppleDisplayName,
  serializePendingAppleDisplayName,
} from "@/services/auth/appleDisplayName";

describe("sanitizeAppleDisplayName", () => {
  it("前後の空白（全角スペース含む）を除く", () => {
    expect(sanitizeAppleDisplayName("　 田中 太郎 　")).toBe("田中 太郎");
  });

  it("空白だけ・空文字・null・undefined は null", () => {
    expect(sanitizeAppleDisplayName(" 　 ")).toBeNull();
    expect(sanitizeAppleDisplayName("")).toBeNull();
    expect(sanitizeAppleDisplayName(null)).toBeNull();
    expect(sanitizeAppleDisplayName(undefined)).toBeNull();
  });

  it("制御文字（NUL・改行・タブ）を除く", () => {
    expect(sanitizeAppleDisplayName("田\u0000中\n太\t郎")).toBe("田中太郎");
  });

  it("書式制御（RLO・ZWSP・BOM）を除く", () => {
    expect(sanitizeAppleDisplayName("a‮b​c﻿d")).toBe("abcd");
  });

  it("ZWJ を含む絵文字と ZWNJ は残す", () => {
    expect(sanitizeAppleDisplayName("👨‍👩‍👧")).toBe("👨‍👩‍👧");
    expect(sanitizeAppleDisplayName("a‌b")).toBe("a‌b");
  });

  it("行区切り・段落区切りを除く", () => {
    expect(sanitizeAppleDisplayName("a b c")).toBe("abc");
  });

  it("300 コードポイントは 255 に切り詰め、サロゲートペアを壊さない", () => {
    const result = sanitizeAppleDisplayName("😀".repeat(300));

    expect(Array.from(result ?? "")).toHaveLength(APPLE_DISPLAY_NAME_MAX_LENGTH);
    expect(result).toBe("😀".repeat(APPLE_DISPLAY_NAME_MAX_LENGTH));
  });
});

describe("hasAnyNameComponent", () => {
  const empty = {
    namePrefix: null,
    givenName: null,
    middleName: null,
    familyName: null,
    nameSuffix: null,
    nickname: null,
  };

  it("null・全項目 null・空白だけは false", () => {
    expect(hasAnyNameComponent(null)).toBe(false);
    expect(hasAnyNameComponent(empty)).toBe(false);
    expect(hasAnyNameComponent({ ...empty, givenName: "  " })).toBe(false);
  });

  it("givenName だけでも true", () => {
    expect(hasAnyNameComponent({ ...empty, givenName: "太郎" })).toBe(true);
  });
});

describe("joinNameComponents", () => {
  it("givenName と familyName を半角スペースで連結し、空要素は除く", () => {
    expect(joinNameComponents({ givenName: "太郎", familyName: "田中" })).toBe("太郎 田中");
    expect(joinNameComponents({ givenName: "太郎", familyName: null })).toBe("太郎");
    expect(joinNameComponents({ givenName: null, familyName: " " })).toBe("");
  });
});

describe("parsePendingAppleDisplayName", () => {
  it("正しい JSON は値を返す", () => {
    expect(parsePendingAppleDisplayName('{"appleUserId":"u1","displayName":"田中"}')).toEqual({
      appleUserId: "u1",
      displayName: "田中",
    });
  });

  it.each([
    ["null", null],
    ["JSON でない", "not json"],
    ["JSON の null", "null"],
    ["appleUserId 欠落", '{"displayName":"田中"}'],
    ["appleUserId が空文字", '{"appleUserId":"","displayName":"田中"}'],
    ["displayName が空文字", '{"appleUserId":"u1","displayName":""}'],
    ["型違い", '{"appleUserId":1,"displayName":"田中"}'],
  ])("%s は null", (_label, raw) => {
    expect(parsePendingAppleDisplayName(raw)).toBeNull();
  });

  it("serialize → parse の往復で同じ値", () => {
    const value = { appleUserId: "u1", displayName: "田中 太郎" };

    expect(parsePendingAppleDisplayName(serializePendingAppleDisplayName(value))).toEqual(value);
  });
});

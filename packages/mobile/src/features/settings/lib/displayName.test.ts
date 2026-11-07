import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  DISPLAY_NAME_MAX_LENGTH,
  displayNameErrorMessage,
  displayNameUpdateErrorMessage,
  toDisplayNameUpdateErrorCode,
  validateDisplayName,
} from "@/features/settings/lib/displayName";

const ch = (codePoint: number) => String.fromCodePoint(codePoint);
const IDEOGRAPHIC_SPACE = ch(0x3000);
const ZWJ = ch(0x200d);
const ZWNJ = ch(0x200c);

describe("validateDisplayName", () => {
  it("前後の空白（全角を含む）を除いた名前を返す", () => {
    expect(validateDisplayName(`${IDEOGRAPHIC_SPACE} さんぽ ${IDEOGRAPHIC_SPACE}`)).toEqual({
      ok: true,
      displayName: "さんぽ",
    });
  });

  it("空・空白だけは empty", () => {
    expect(validateDisplayName("")).toEqual({ ok: false, reason: "empty" });
    expect(validateDisplayName(` ${IDEOGRAPHIC_SPACE} `)).toEqual({ ok: false, reason: "empty" });
  });

  it("上限は code point で数える（サロゲートペアの絵文字も1文字。backend と同じ）", () => {
    expect(validateDisplayName("🚶".repeat(DISPLAY_NAME_MAX_LENGTH))).toEqual({
      ok: true,
      displayName: "🚶".repeat(DISPLAY_NAME_MAX_LENGTH),
    });
    expect(validateDisplayName("あ".repeat(DISPLAY_NAME_MAX_LENGTH + 1))).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it.each([
    ["改行", `名${ch(0x0a)}前`],
    ["タブ", `名${ch(0x09)}前`],
    ["双方向の上書き", `名${ch(0x202e)}前`],
    ["ゼロ幅スペース", `名${ch(0x200b)}前`],
    ["行区切り", `名${ch(0x2028)}前`],
  ])("%s を含むと forbidden_characters", (_label, input) => {
    expect(validateDisplayName(input)).toEqual({ ok: false, reason: "forbidden_characters" });
  });

  it("絵文字の合字の ZWJ と ZWNJ は使える（backend と同じ）", () => {
    const family = `👨${ZWJ}👩${ZWJ}👧`;
    expect(validateDisplayName(family)).toEqual({ ok: true, displayName: family });
    expect(validateDisplayName(`a${ZWNJ}b`)).toEqual({ ok: true, displayName: `a${ZWNJ}b` });
  });
});

describe("displayNameErrorMessage", () => {
  it("empty は文言を出さず、ほかは理由を伝える", () => {
    expect(displayNameErrorMessage("empty")).toBeNull();
    expect(displayNameErrorMessage("too_long")).toBe("表示名は50文字までです");
    expect(displayNameErrorMessage("forbidden_characters")).toBe("改行や見えない文字は使えません");
  });
});

describe("toDisplayNameUpdateErrorCode", () => {
  it.each([
    [new ApiError(422), "invalid"],
    [new ApiError(401), "unauthorized"],
    [new ApiError(503), "server"],
    [new ApiError(404), "unknown"],
    [new TypeError("Network request failed"), "network"],
    [new Error("x"), "unknown"],
  ] as const)("%s → %s", (error, expected) => {
    expect(toDisplayNameUpdateErrorCode(error)).toBe(expected);
  });

  it("どの分類にも文言がある", () => {
    for (const code of ["invalid", "unauthorized", "network", "server", "unknown"] as const) {
      expect(displayNameUpdateErrorMessage(code)).not.toBe("");
    }
  });
});

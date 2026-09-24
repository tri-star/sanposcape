import { describe, expect, it } from "vitest";

import { PIN_TAGS_MAX_COUNT, PIN_TAG_MAX_LENGTH } from "@/features/pin/lib/pinLimits";
import {
  addTag,
  addTagErrorMessage,
  normalizeTagLabel,
  removeTag,
} from "@/features/pin/lib/pinTags";

describe("normalizeTagLabel", () => {
  it.each([
    ["  パン屋  ", "パン屋"],
    ["#ランチ", "ランチ"],
    ["＃ランチ", "ランチ"],
    ["##ランチ", "ランチ"],
    ["a   b", "a b"],
    ["Cafe", "Cafe"],
    ["🌸", "🌸"],
  ])("%s -> %s", (raw, expected) => {
    expect(normalizeTagLabel(raw)).toBe(expected);
  });

  it("記号・空白のみは空文字になる", () => {
    expect(normalizeTagLabel("  ###  ")).toBe("");
  });
});

describe("addTag", () => {
  it("空・空白のみ・#のみは empty", () => {
    expect(addTag([], "")).toEqual({ ok: false, reason: "empty" });
    expect(addTag([], "   ")).toEqual({ ok: false, reason: "empty" });
    expect(addTag([], "#")).toEqual({ ok: false, reason: "empty" });
  });

  it(`${PIN_TAG_MAX_LENGTH}文字はOK、${PIN_TAG_MAX_LENGTH + 1}文字はtoo_long（サロゲートペア含む）`, () => {
    const ok = "🌸".repeat(PIN_TAG_MAX_LENGTH);
    expect(Array.from(ok)).toHaveLength(PIN_TAG_MAX_LENGTH);
    expect(addTag([], ok)).toEqual({ ok: true, tags: [ok] });

    const tooLong = "🌸".repeat(PIN_TAG_MAX_LENGTH + 1);
    expect(addTag([], tooLong)).toEqual({ ok: false, reason: "too_long" });
  });

  it("既存に大文字小文字違いの同じタグがあれば duplicate", () => {
    expect(addTag(["Cafe"], "cafe")).toEqual({ ok: false, reason: "duplicate" });
  });

  it(`${PIN_TAGS_MAX_COUNT}個ある状態で追加すると limit`, () => {
    const tags = Array.from({ length: PIN_TAGS_MAX_COUNT }, (_, i) => `tag-${i}`);
    expect(addTag(tags, "new-tag")).toEqual({ ok: false, reason: "limit" });
  });

  it("正常系は正規化済みラベルが追加された配列を返す", () => {
    expect(addTag(["既存"], "  #新規  ")).toEqual({ ok: true, tags: ["既存", "新規"] });
  });
});

describe("removeTag", () => {
  it("該当するタグだけ消える", () => {
    expect(removeTag(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("該当しなければ無変化", () => {
    expect(removeTag(["a", "b"], "z")).toEqual(["a", "b"]);
  });
});

describe("addTagErrorMessage", () => {
  it.each(["empty", "too_long", "duplicate", "limit"] as const)("%s に文言がある", (reason) => {
    expect(addTagErrorMessage(reason).length).toBeGreaterThan(0);
  });
});

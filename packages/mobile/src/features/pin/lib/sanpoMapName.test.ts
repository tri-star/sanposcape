import { describe, expect, it } from "vitest";

import {
  SANPO_MAP_NAME_MAX_LENGTH,
  sanpoMapNameErrorMessage,
  validateSanpoMapName,
} from "@/features/pin/lib/sanpoMapName";

describe("validateSanpoMapName", () => {
  it.each(["", "   ", "　　", "   "])("空白のみ（%j）は empty", (input) => {
    expect(validateSanpoMapName(input)).toEqual({ ok: false, reason: "empty" });
  });

  it("前後の空白を除いた値を返す", () => {
    expect(validateSanpoMapName("　 近所の散歩 ")).toEqual({ ok: true, name: "近所の散歩" });
  });

  it("50 code point ちょうどは OK", () => {
    const name = "あ".repeat(SANPO_MAP_NAME_MAX_LENGTH);
    expect(validateSanpoMapName(name)).toEqual({ ok: true, name });
  });

  it("絵文字（サロゲートペア）は1文字と数える", () => {
    const name = "😀".repeat(SANPO_MAP_NAME_MAX_LENGTH);
    expect(name.length).toBe(100);
    expect(validateSanpoMapName(name)).toEqual({ ok: true, name });
  });

  it("51 code point は too_long", () => {
    expect(validateSanpoMapName("あ".repeat(51))).toEqual({ ok: false, reason: "too_long" });
    expect(validateSanpoMapName("😀".repeat(51))).toEqual({ ok: false, reason: "too_long" });
  });

  it("trim 後に 50 以内なら前後の空白が多くても OK", () => {
    const name = "a".repeat(50);
    expect(validateSanpoMapName(`  ${name}  `)).toEqual({ ok: true, name });
  });
});

describe("sanpoMapNameErrorMessage", () => {
  it("empty は null、too_long は文言", () => {
    expect(sanpoMapNameErrorMessage("empty")).toBeNull();
    expect(sanpoMapNameErrorMessage("too_long")).toBe("地図の名前は50文字までです");
  });
});

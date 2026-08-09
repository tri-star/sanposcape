import { describe, expect, it } from "vitest";

import { truncateUnicodeCodePoints } from "@/features/walk/lib/unicodeText";

describe("truncateUnicodeCodePoints", () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "非有限または0以下の上限 %s では空文字を返す",
    (maximumLength) => {
      expect(truncateUnicodeCodePoints("緑町公園", maximumLength)).toBe("");
    },
  );

  it("小数の上限は切り捨て、先頭からその code point 数だけを返す", () => {
    expect(truncateUnicodeCodePoints("緑町公園", 1.5)).toBe("緑");
  });

  it("1未満の正の小数上限では空文字を返す", () => {
    expect(truncateUnicodeCodePoints("緑町公園", 0.5)).toBe("");
  });
});

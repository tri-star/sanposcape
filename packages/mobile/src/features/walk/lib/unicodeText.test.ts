import { describe, expect, it } from "vitest";

import { truncateUnicodeCodePoints } from "@/features/walk/lib/unicodeText";

describe("truncateUnicodeCodePoints", () => {
  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "非有限または0以下の上限 %s では空文字を返す",
    (maximumLength) => {
      expect(truncateUnicodeCodePoints("緑町公園", maximumLength)).toBe("");
    },
  );
});

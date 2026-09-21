import { describe, expect, it } from "vitest";

import { FEATURE_FLAG_KEYS } from "@/config/featureFlags";

const KEY_PATTERN = /^[a-z][a-zA-Z\d_-]{0,63}$/;

describe("FEATURE_FLAG_KEYS", () => {
  const values = Object.values(FEATURE_FLAG_KEYS);

  it("値がADR-008追補D7の命名規約（snake_case、^[a-z][a-zA-Z\\d_-]{0,63}$）に一致する", () => {
    for (const value of values) {
      expect(value).toMatch(KEY_PATTERN);
    }
  });

  it("値の重複が無い", () => {
    expect(new Set(values).size).toBe(values.length);
  });

  it("_enabled 接尾辞を持たない（値が bool なので冗長。ADR-008 追補 D7）", () => {
    for (const value of values) {
      expect(value.endsWith("_enabled")).toBe(false);
    }
  });
});

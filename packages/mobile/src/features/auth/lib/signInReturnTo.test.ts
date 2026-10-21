import { describe, expect, it } from "vitest";

import { parseSignInReturnTo } from "@/features/auth/lib/signInReturnTo";

describe("parseSignInReturnTo", () => {
  it("許可リストの値だけを通す", () => {
    expect(parseSignInReturnTo("account")).toBe("account");
  });

  it.each([
    undefined,
    null,
    "",
    "pins",
    "/(tabs)/account",
    "https://example.com",
    "//evil.example",
    "toString",
    "__proto__",
    ["account"],
    1,
  ])("許可外の値は null にする: %j", (value) => {
    expect(parseSignInReturnTo(value)).toBeNull();
  });
});

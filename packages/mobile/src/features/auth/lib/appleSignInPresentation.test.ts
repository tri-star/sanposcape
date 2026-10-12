import { describe, expect, it } from "vitest";

import {
  appleButtonVariantFor,
  shouldShowAppleSignIn,
} from "@/features/auth/lib/appleSignInPresentation";

describe("shouldShowAppleSignIn", () => {
  it("iOS だけ true", () => {
    expect(shouldShowAppleSignIn("ios")).toBe(true);
  });

  it("android と web は false", () => {
    expect(shouldShowAppleSignIn("android")).toBe(false);
    expect(shouldShowAppleSignIn("web")).toBe(false);
  });
});

describe("appleButtonVariantFor", () => {
  it("ライトは黒、ダークは白", () => {
    expect(appleButtonVariantFor("light")).toBe("black");
    expect(appleButtonVariantFor("dark")).toBe("white");
  });
});

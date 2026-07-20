import { describe, expect, it } from "vitest";

import {
  getAvatarInitial,
  resolveAvatarAppearance,
  type AvatarSize,
} from "@/components/ui/avatar/avatarStyles";
import { lightTheme } from "@/theme/tokens";

const SIZES: AvatarSize[] = ["sm", "md", "lg", "xl"];

describe("getAvatarInitial", () => {
  it("先頭1文字を大文字で返す", () => {
    expect(getAvatarInitial("taro")).toBe("T");
  });

  it("日本語の先頭1文字を返す", () => {
    expect(getAvatarInitial("太郎")).toBe("太");
  });

  it("先頭・末尾の空白を無視する", () => {
    expect(getAvatarInitial("  taro  ")).toBe("T");
  });

  it("空文字は null", () => {
    expect(getAvatarInitial("")).toBeNull();
  });

  it("空白のみは null", () => {
    expect(getAvatarInitial("   ")).toBeNull();
  });

  it("undefined は null", () => {
    expect(getAvatarInitial(undefined)).toBeNull();
  });

  it("サロゲートペア(絵文字)を壊さない", () => {
    expect(getAvatarInitial("😀太郎")).toBe("😀");
  });
});

describe("resolveAvatarAppearance", () => {
  it("size ごとに boxSize が単調増加する", () => {
    const boxSizes = SIZES.map((size) => resolveAvatarAppearance(lightTheme, { size }).boxSize);
    expect(boxSizes[0]).toBeLessThan(boxSizes[1]);
    expect(boxSizes[1]).toBeLessThan(boxSizes[2]);
    expect(boxSizes[2]).toBeLessThan(boxSizes[3]);
  });

  it("常に円形(borderRadius が pill)", () => {
    for (const size of SIZES) {
      expect(resolveAvatarAppearance(lightTheme, { size }).borderRadius).toBe(
        lightTheme.radius.pill,
      );
    }
  });

  it("backgroundColor/initialColor が定義される", () => {
    const appearance = resolveAvatarAppearance(lightTheme, { size: "md" });
    expect(appearance.backgroundColor).toBeTruthy();
    expect(appearance.initialColor).toBeTruthy();
  });
});

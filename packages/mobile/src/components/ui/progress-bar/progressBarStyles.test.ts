import { describe, expect, it } from "vitest";

import {
  clampProgress,
  resolveProgressBarAppearance,
} from "@/components/ui/progress-bar/progressBarStyles";
import { lightTheme } from "@/theme/tokens";

describe("clampProgress", () => {
  it("範囲内の値はそのまま", () => {
    expect(clampProgress(0.5)).toBe(0.5);
  });

  it("負の値は 0", () => {
    expect(clampProgress(-1)).toBe(0);
  });

  it("1 超は 1", () => {
    expect(clampProgress(2)).toBe(1);
  });

  it("NaN は 0", () => {
    expect(clampProgress(Number.NaN)).toBe(0);
  });

  it("+Infinity は 1", () => {
    expect(clampProgress(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("-Infinity は 0", () => {
    expect(clampProgress(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it("境界値 0 / 1 はそのまま", () => {
    expect(clampProgress(0)).toBe(0);
    expect(clampProgress(1)).toBe(1);
  });
});

describe("resolveProgressBarAppearance", () => {
  it("value を 0〜100 の fillWidthPercent に変換する", () => {
    expect(
      resolveProgressBarAppearance(lightTheme, { value: 0.5, size: "md" }).fillWidthPercent,
    ).toBe(50);
  });

  it("範囲外の value もクランプされる", () => {
    expect(
      resolveProgressBarAppearance(lightTheme, { value: -1, size: "md" }).fillWidthPercent,
    ).toBe(0);
    expect(
      resolveProgressBarAppearance(lightTheme, { value: 2, size: "md" }).fillWidthPercent,
    ).toBe(100);
  });

  it("color 未指定は theme.colors.primary", () => {
    const appearance = resolveProgressBarAppearance(lightTheme, { value: 0.5, size: "md" });
    expect(appearance.fillColor).toBe(lightTheme.colors.primary);
  });

  it("color 指定時はそれを使う", () => {
    const appearance = resolveProgressBarAppearance(lightTheme, {
      value: 0.5,
      size: "md",
      color: lightTheme.colors.success,
    });
    expect(appearance.fillColor).toBe(lightTheme.colors.success);
  });

  it("size: sm は size: md より height が小さい", () => {
    const sm = resolveProgressBarAppearance(lightTheme, { value: 0.5, size: "sm" });
    const md = resolveProgressBarAppearance(lightTheme, { value: 0.5, size: "md" });
    expect(sm.height).toBeLessThan(md.height);
  });

  it("borderRadius が pill", () => {
    const appearance = resolveProgressBarAppearance(lightTheme, { value: 0.5, size: "md" });
    expect(appearance.borderRadius).toBe(lightTheme.radius.pill);
  });
});

import { describe, expect, it } from "vitest";

import {
  darkTheme,
  letterSpacing,
  lightTheme,
  lineHeight,
  resolveTheme,
  type ThemeColors,
} from "@/theme/tokens";

describe("resolveTheme", () => {
  it("mode が light/dark のときは端末設定を無視して固定する", () => {
    expect(resolveTheme("light", "dark")).toBe(lightTheme);
    expect(resolveTheme("dark", "light")).toBe(darkTheme);
  });

  it("mode が system のときは端末設定に追従する", () => {
    expect(resolveTheme("system", "dark")).toBe(darkTheme);
    expect(resolveTheme("system", "light")).toBe(lightTheme);
  });

  it("端末設定が取得できないときは light にフォールバックする", () => {
    expect(resolveTheme("system", null)).toBe(lightTheme);
    expect(resolveTheme("system", undefined)).toBe(lightTheme);
  });
});

describe("themes", () => {
  it("light と dark で semantic カラーのキーが揃っている", () => {
    const lightKeys = Object.keys(lightTheme.colors).sort();
    const darkKeys = Object.keys(darkTheme.colors).sort();
    expect(darkKeys).toEqual(lightKeys);
  });

  it("面・文字・primary はライトとダークで別の値になっている", () => {
    // ダークテーマの定義漏れ（light の値をそのまま流用している）を検出する。
    const keys: (keyof ThemeColors)[] = [
      "surfaceApp",
      "surfaceCard",
      "textPrimary",
      "textSecondary",
      "borderSubtle",
      "primary",
      "onPrimary",
    ];
    for (const key of keys) {
      expect(darkTheme.colors[key], key).not.toBe(lightTheme.colors[key]);
    }
  });

  it("地図カテゴリの色がライトとダークの両方で定義されている", () => {
    expect(Object.keys(darkTheme.map).sort()).toEqual(Object.keys(lightTheme.map).sort());
  });

  it("onColor は彩度の高い面に載せる色なので両テーマとも白", () => {
    // primary の面に載せる onPrimary と役割が違う。混同すると
    // ダークで primary(明るい青) の上に白文字が乗りコントラストが落ちる。
    expect(lightTheme.colors.onColor).toBe("#ffffff");
    expect(darkTheme.colors.onColor).toBe("#ffffff");
    expect(darkTheme.colors.onPrimary).not.toBe(darkTheme.colors.onColor);
  });
});

describe("タイポグラフィの換算", () => {
  it("leading（倍率）を px の lineHeight に換算する", () => {
    expect(lineHeight(15, 1.55)).toBeCloseTo(23.25);
  });

  it("tracking（em）を px の letterSpacing に換算する", () => {
    expect(letterSpacing(24, -0.01)).toBeCloseTo(-0.24);
  });
});

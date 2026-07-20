import { describe, expect, it } from "vitest";

import type { GeneratedTheme } from "./buildThemes";
import { emitTypeScript } from "./emitTypeScript";

function makeTheme(overrides: Partial<GeneratedTheme> = {}): GeneratedTheme {
  return {
    colors: {},
    spacing: {},
    radius: {},
    sizing: {},
    fontFamily: {},
    typography: {},
    shadow: {},
    ring: {},
    easing: {},
    duration: {},
    ...overrides,
  };
}

describe("emitTypeScript", () => {
  it("固定のヘッダコメントを含む", () => {
    const output = emitTypeScript({ light: makeTheme(), dark: makeTheme() });

    expect(output).toContain("このファイルは自動生成物です。手編集しないでください。");
    expect(output).toContain("design/tokens/*.css");
    expect(output).toContain("pnpm --filter mobile design:tokens");
  });

  it("export される定数名と型が含まれる", () => {
    const output = emitTypeScript({ light: makeTheme(), dark: makeTheme() });

    expect(output).toContain("export const generatedLightTokens = ");
    expect(output).toContain("export const generatedDarkTokens = ");
    expect(output).toContain("export type GeneratedTokens = typeof generatedLightTokens;");
  });

  it("カテゴリ内のキーがソート済みで出力される", () => {
    const light = makeTheme({ colors: { z: "#000", a: "#fff", m: "#888" } });

    const output = emitTypeScript({ light, dark: makeTheme() });

    const aIndex = output.indexOf('"a":');
    const mIndex = output.indexOf('"m":');
    const zIndex = output.indexOf('"z":');
    expect(aIndex).toBeGreaterThan(-1);
    expect(aIndex).toBeLessThan(mIndex);
    expect(mIndex).toBeLessThan(zIndex);
  });

  it("トップレベルのカテゴリキーもソート済みで出力される(colors が typography より先)", () => {
    const light = makeTheme({ typography: { "text-md": "15px" }, colors: { primary: "#1585fe" } });

    const output = emitTypeScript({ light, dark: makeTheme() });

    const colorsIndex = output.indexOf('"colors":');
    const typographyIndex = output.indexOf('"typography":');
    expect(colorsIndex).toBeGreaterThan(-1);
    expect(colorsIndex).toBeLessThan(typographyIndex);
  });

  it("数値は引用符なし、文字列は引用符付きで出力される", () => {
    const light = makeTheme({ spacing: { "4": 16 }, colors: { primary: "#1585fe" } });

    const output = emitTypeScript({ light, dark: makeTheme() });

    expect(output).toContain('"4": 16,');
    expect(output).toContain('"primary": "#1585fe",');
  });

  it("同じ入力からは常に同じ文字列が生成される(冪等性)", () => {
    const themes = {
      light: makeTheme({ colors: { primary: "#1585fe" }, spacing: { "4": 16 } }),
      dark: makeTheme({ colors: { primary: "#3d97fe" }, spacing: { "4": 16 } }),
    };

    const first = emitTypeScript(themes);
    const second = emitTypeScript(themes);

    expect(first).toBe(second);
  });

  it("空のカテゴリは {} として出力される", () => {
    const output = emitTypeScript({ light: makeTheme(), dark: makeTheme() });

    expect(output).toContain('"colors": {},');
  });
});

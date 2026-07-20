import { describe, expect, it } from "vitest";

import { darkTheme, lightTheme } from "@/theme/tokens";

/** 深さ優先でキー集合を再帰的に集める(値は無視) */
function collectKeyPaths(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") {
    return [prefix];
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
    collectKeyPaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

/** 値がオブジェクトの葉(string/number)を再帰的に集める */
function collectLeafValues(value: unknown): (string | number)[] {
  if (typeof value === "string" || typeof value === "number") {
    return [value];
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap(collectLeafValues);
  }
  return [];
}

describe("lightTheme と darkTheme のキー構造", () => {
  it("再帰的に完全一致する", () => {
    const lightKeys = collectKeyPaths(lightTheme).sort();
    const darkKeys = collectKeyPaths(darkTheme).sort();
    expect(darkKeys).toEqual(lightKeys);
  });
});

describe("radius", () => {
  it.each([lightTheme, darkTheme])("5px 未満の値が存在しない", (theme) => {
    for (const value of Object.values(theme.radius)) {
      expect(value).toBeGreaterThanOrEqual(5);
    }
  });
});

describe("typography", () => {
  it.each([lightTheme, darkTheme])("全エントリで lineHeight が fontSize 以上", (theme) => {
    for (const style of Object.values(theme.typography)) {
      expect(style.lineHeight).toBeGreaterThanOrEqual(style.fontSize);
    }
  });

  it.each([lightTheme, darkTheme])("data 系ロールに tabular-nums が付く", (theme) => {
    expect(theme.typography.data.fontVariant).toEqual(["tabular-nums"]);
    expect(theme.typography.dataSm.fontVariant).toEqual(["tabular-nums"]);
    expect(theme.typography.body.fontVariant).toBeUndefined();
  });
});

describe("shadow", () => {
  it("light は純黒ではなく青灰(rgba(27, 36, 48)系)を使う", () => {
    for (const value of Object.values(lightTheme.shadow)) {
      expect(value).toContain("rgba(27, 36, 48");
      expect(value).not.toContain("#000");
      expect(value).not.toContain("rgba(0, 0, 0");
    }
  });

  // 【プランからの補正】mobile-plan.md は「影は #000 を使わない」を light/dark 共通の
  // 規律として想定していたが、DS の実データ(effects.css の [data-theme="dark"])では
  // dark モードの影は意図的に rgba(0, 0, 0, ...) へ切り替わる(暗い面の上では青灰の
  // 影が視認できないための実務的な判断とみられる)。DS が SSoT のため、ここでは
  // 「light は青灰・純黒禁止」のみを検証し、dark には別の期待値を設定する。
  it("dark は DS の実データどおり rgba(0, 0, 0)系の影を使う", () => {
    for (const value of Object.values(darkTheme.shadow)) {
      expect(value).toContain("rgba(0, 0, 0");
    }
  });
});

describe("colors", () => {
  it.each([lightTheme, darkTheme])(
    "全ての値が有効な色文字列で未解決の var( を含まない",
    (theme) => {
      for (const value of collectLeafValues(theme.colors)) {
        expect(typeof value).toBe("string");
        expect(value as string).not.toContain("var(");
        expect(value as string).toMatch(/^(#|rgb)/);
      }
    },
  );
});

describe("fontFamily", () => {
  it.each([lightTheme, darkTheme])("全エントリが空文字でない", (theme) => {
    for (const value of Object.values(theme.fontFamily)) {
      expect(value.length).toBeGreaterThan(0);
    }
  });
});

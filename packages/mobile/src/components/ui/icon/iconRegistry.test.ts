import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { ICON_REGISTRY, isIconName } from "@/components/ui/icon/iconRegistry";

/**
 * `lucide-react-native` の named import 一覧をソースから抜き出す(実行時の import 解決ではなく
 * 静的なソース解析)。`import { A, B, ... } from "lucide-react-native";` の1ブロックのみを想定する。
 */
function extractNamedImports(sourceText: string): string[] {
  const match = /import\s*\{([^}]+)\}\s*from\s*"lucide-react-native"/.exec(sourceText);
  if (!match?.[1]) {
    throw new Error("lucide-react-native からの named import ブロックが見つかりません");
  }
  return match[1]
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

/** `export const Xxx = ...` 形式の named export 一覧をソースから抜き出す */
function extractNamedExports(sourceText: string): string[] {
  return [...sourceText.matchAll(/^export const (\w+)/gm)].map((match) => match[1] as string);
}

describe("isIconName", () => {
  it("既知の名前は true", () => {
    expect(isIconName("home")).toBe(true);
    expect(isIconName("map-pin")).toBe(true);
  });

  it("未知の名前は false", () => {
    expect(isIconName("does-not-exist")).toBe(false);
    expect(isIconName("")).toBe(false);
  });
});

describe("ICON_REGISTRY", () => {
  it("全エントリが truthy(import 漏れがない)", () => {
    for (const [name, component] of Object.entries(ICON_REGISTRY)) {
      expect(component, `${name} が未定義です`).toBeTruthy();
    }
  });

  it("全キーが kebab-case(Lucide の実名に合わせ末尾の数字は許容する。例: check-circle-2)", () => {
    const kebabCasePattern = /^[a-z0-9]+(-[a-z0-9]+)*$/;
    for (const name of Object.keys(ICON_REGISTRY)) {
      expect(name).toMatch(kebabCasePattern);
    }
  });
});

describe("iconRegistry.ts と src/test/mocks/lucide-react-native.ts の同期(C-8)", () => {
  // `lucide-react-native` はテスト環境で常にこのモックへ alias される(vitest.config.ts)。
  // 「全エントリが truthy」テストは import 漏れ(モック側に無い名前)を間接的に検知できるが、
  // モック側だけに残った不要エントリ(逆方向のズレ)までは検知できない。
  // ここではソースを静的解析し、名前の集合が完全に一致することを直接検証する。
  const registrySource = readFileSync(path.resolve(__dirname, "iconRegistry.ts"), "utf-8");
  const mockSource = readFileSync(
    path.resolve(__dirname, "../../../test/mocks/lucide-react-native.ts"),
    "utf-8",
  );

  it("iconRegistry.ts が import する名前と、モックが export する名前が完全に一致する", () => {
    const imported = extractNamedImports(registrySource).sort();
    const mocked = extractNamedExports(mockSource).sort();
    expect(imported).toEqual(mocked);
  });
});

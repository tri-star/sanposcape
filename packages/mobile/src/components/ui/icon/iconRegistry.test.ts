import { readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

import { describe, expect, it } from "vitest";

// RN コンポーネントを import せず、配布物の実体を検査する。
// Lucide は旧名の型定義だけを残すことがあり、typecheck だけでは欠落を検知できない。
const registrySource = readFileSync(path.join(__dirname, "iconRegistry.ts"), "utf8");
const iconNames = Array.from(
  registrySource.matchAll(/from\s+["']lucide-react-native\/icons\/([^"']+)["']/g),
  (match) => match[1],
);
const require = createRequire(import.meta.url);
const packageRoot = path.resolve(path.dirname(require.resolve("lucide-react-native")), "../..");
const manifest = JSON.parse(readFileSync(path.join(packageRoot, "package.json"), "utf8"));
const nativeIconExport: string = manifest.exports["./icons/*"]["react-native"];

describe("iconRegistry の Lucide 個別 import", () => {
  it("検査対象の import が存在する", () => {
    expect(iconNames.length).toBeGreaterThan(0);
  });

  it.each(iconNames)("%s の React Native 向け実装ファイルが存在する", (name) => {
    const implementation = path.resolve(packageRoot, nativeIconExport.replaceAll("*", name));
    expect(implementation).toMatch(/\.mjs$/);
    expect(statSync(implementation).isFile()).toBe(true);
  });
});

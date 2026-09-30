import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `.oxlintrc.json` の `no-restricted-imports` の同期検査。
 * oxlint は同じルールの override を後勝ちで置き換える（マージしない）ため、複数の制限を受ける範囲の
 * override には全パターンを再掲する必要がある。再掲したパターン・message がずれる（片方だけ直す）
 * 事故を、ここで機械的に止める。
 */
type Pattern = { group: string[]; message: string };
type Override = {
  files: string[];
  rules?: { "no-restricted-imports"?: [string, { patterns: Pattern[] }] };
};

function loadOverrides(): Override[] {
  const raw = readFileSync(path.resolve(__dirname, "../../.oxlintrc.json"), "utf8");
  // JSONC: 行頭のコメント行だけを落とす（"$schema" の URL の // を壊さない）。
  const json = raw
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  return (JSON.parse(json) as { overrides: Override[] }).overrides;
}

const overrides = loadOverrides();
const restricted = overrides.flatMap((override) => {
  const patterns = override.rules?.["no-restricted-imports"]?.[1].patterns;
  return patterns === undefined ? [] : [{ files: override.files, patterns }];
});
const AUTH_GROUP_KEY = "@/store/useAuthSessionStore";
const DEV_TOOLS_GROUP_KEY = "@/config/devTools";
const findPattern = (patterns: Pattern[], key: string) =>
  patterns.find((pattern) => pattern.group.includes(key));

describe(".oxlintrc.json の no-restricted-imports", () => {
  it("制限つきの override が存在する", () => {
    expect(restricted.length).toBeGreaterThan(0);
  });

  it("devTools 制限は src/** 全体に掛かる（app/ 以外はすべて禁止）", () => {
    const base = restricted.find(({ files }) => files.includes("src/**"));
    expect(base).toBeDefined();
    expect(findPattern(base!.patterns, DEV_TOOLS_GROUP_KEY)).toBeDefined();
  });

  it("認証制限を持つ override は devTools 制限も再掲している（置き換えで外れない）", () => {
    for (const { files, patterns } of restricted) {
      if (findPattern(patterns, AUTH_GROUP_KEY) === undefined) continue;
      expect(findPattern(patterns, DEV_TOOLS_GROUP_KEY), files.join(",")).toBeDefined();
    }
  });

  it.each([AUTH_GROUP_KEY, DEV_TOOLS_GROUP_KEY])(
    "%s を含む制限は、どの override でも group と message が同一",
    (key) => {
      const copies = restricted
        .map(({ patterns }) => findPattern(patterns, key))
        .filter((pattern): pattern is Pattern => pattern !== undefined);
      expect(copies.length).toBeGreaterThan(0);
      for (const copy of copies) expect(copy).toEqual(copies[0]);
    },
  );

  it("devTools 制限は相対 import（**/devTools）も塞ぐ", () => {
    const pattern = findPattern(restricted[0]!.patterns, DEV_TOOLS_GROUP_KEY);
    expect(pattern?.group).toContain("**/devTools");
  });
});

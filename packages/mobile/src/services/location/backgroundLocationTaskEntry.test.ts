import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `index.ts` の import 順の契約テスト（SS-156 / ADR-M-018）。
 * defineTask の import が消える・順序が入れ替わると、タスクが届いたときに expo-task-manager が
 * 「未定義のタスク」として登録解除し、背面での記録が黙って止まる。
 */
describe("index.ts のエントリ", () => {
  const source = readFileSync(path.resolve(__dirname, "../../../index.ts"), "utf8");
  // 行頭の import 文だけを対象にする（コメント内の同じ文字列では通らない）。
  const importIndex = (specifier: string): number =>
    source.search(new RegExp(`^import ["']${specifier}["'];?\\s*$`, "m"));
  const taskImport = importIndex("@/services/location/backgroundLocationTask");
  const cleanupImport = importIndex("@/lib/backgroundLocationCleanup");
  const routerImport = importIndex("expo-router/entry");

  it("タスク定義と起動時の後始末を副作用 import している", () => {
    expect(taskImport).toBeGreaterThanOrEqual(0);
    expect(cleanupImport).toBeGreaterThanOrEqual(0);
    expect(routerImport).toBeGreaterThanOrEqual(0);
  });

  it("どちらも expo-router/entry より前に import している", () => {
    expect(taskImport).toBeLessThan(routerImport);
    expect(cleanupImport).toBeLessThan(routerImport);
  });
});

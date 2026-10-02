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
  const taskImport = source.indexOf('import "@/services/location/backgroundLocationTask"');
  const cleanupImport = source.indexOf('import "@/lib/backgroundLocationCleanup"');
  const routerImport = source.indexOf('import "expo-router/entry"');

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

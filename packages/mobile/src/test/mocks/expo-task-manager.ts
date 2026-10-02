/**
 * vitest(node環境) 用の expo-task-manager 最小モック。
 * `backgroundLocationTask.ts` が（`location.real.ts` 経由で）import されても壊れないためだけのもの。
 * タスクの振る舞いは `createBackgroundSampleHub` を直接テストすること。
 */
export function defineTask(_name: string, _executor: unknown): void {}

export async function isAvailableAsync(): Promise<boolean> {
  return false;
}

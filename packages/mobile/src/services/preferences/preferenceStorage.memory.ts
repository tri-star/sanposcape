import type { PreferenceStorage } from "@/services/preferences/types";

/** メモリ上の実装（テスト用）。`tokenStore.memory.ts` と同じ位置づけ。 */
export function createMemoryPreferenceStorage(initial: string | null = null): PreferenceStorage & {
  /** テストで中身を検証するための読み出し。 */
  peek(): string | null;
} {
  let stored: string | null = initial;
  return {
    read() {
      return stored;
    },
    write(raw) {
      stored = raw;
    },
    peek() {
      return stored;
    },
  };
}

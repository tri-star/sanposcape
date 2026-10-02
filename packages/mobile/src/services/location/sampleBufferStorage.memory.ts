import type { SampleBufferStorage } from "@/services/location/types";

/**
 * メモリ上の SampleBufferStorage（vitest / mock モード用）。ネイティブ依存なし。
 * `peek()` はテストが中身を直接確認するための覗き窓。
 */
export function createMemorySampleBufferStorage(
  initial: string | null = null,
): SampleBufferStorage & { peek(): string | null } {
  let value: string | null = initial;
  return {
    read: () => value,
    append(raw) {
      value = (value ?? "") + raw;
    },
    clear() {
      value = null;
    },
    peek: () => value,
  };
}

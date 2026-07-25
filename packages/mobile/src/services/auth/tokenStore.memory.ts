import type { RefreshTokenPersistence } from "@/services/auth/types";

/** メモリ上の refresh token 永続化（mock モード / テスト用）。プロセス終了で消える。 */
export function createMemoryRefreshTokenPersistence(
  initial: string | null = null,
): RefreshTokenPersistence {
  let stored: string | null = initial;

  return {
    async load() {
      return stored;
    },
    async save(token: string) {
      stored = token;
    },
    async remove() {
      stored = null;
    },
  };
}

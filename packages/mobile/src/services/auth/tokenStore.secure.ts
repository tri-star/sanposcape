import * as SecureStore from "expo-secure-store";

import type { RefreshTokenPersistence } from "@/services/auth/types";

/** SecureStore(Keychain / Android Keystore) 上の refresh token 保存キー。 */
const REFRESH_TOKEN_KEY = "sanposcape.refreshToken";

/**
 * SecureStore(Keychain / Android Keystore) に refresh token を保存する永続化実装。
 * このファイルは `index.ts` からのみ import される（ネイティブ依存のためテスト対象にしない）。
 *
 * `keychainAccessible` はデフォルト（WHEN_UNLOCKED）でよい。バックグラウンドでのトークン更新が
 * 必要になった時点で再検討する。
 */
export const secureRefreshTokenPersistence: RefreshTokenPersistence = {
  async load() {
    try {
      return await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    } catch {
      // 端末の Keystore 破損・OS 更新直後などで読めないケースがある。
      // ここで throw すると起動不能になるため、例外を握りつぶして null を返す。
      return null;
    }
  },
  async save(token: string) {
    await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
  },
  async remove() {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
  },
};

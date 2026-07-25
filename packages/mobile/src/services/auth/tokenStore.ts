import type { AccessToken, RefreshTokenPersistence, TokenStore } from "@/services/auth/types";

/**
 * access token をメモリに、refresh token を persistence に保持する TokenStore を作る。
 * `react-native` / `expo-secure-store` を import しない（persistence は引数で受け取る）。
 * これにより vitest でフェイク persistence を使って完全にテストできる。
 */
export function createTokenStore(persistence: RefreshTokenPersistence): TokenStore {
  let accessToken: AccessToken | null = null;
  let refreshTokenCache: string | null = null;
  let refreshTokenLoaded = false;

  return {
    getAccessToken() {
      return accessToken;
    },
    setAccessToken(token: AccessToken | null) {
      accessToken = token;
    },
    async getRefreshToken() {
      if (!refreshTokenLoaded) {
        refreshTokenCache = await persistence.load();
        refreshTokenLoaded = true;
      }
      return refreshTokenCache;
    },
    async setRefreshToken(token: string | null) {
      if (token === null) {
        await persistence.remove();
        refreshTokenCache = null;
        refreshTokenLoaded = true;
        return;
      }
      await persistence.save(token);
      refreshTokenCache = token;
      refreshTokenLoaded = true;
    },
    async clear() {
      // persistence が失敗しても access token のクリアは必ず行う。
      try {
        await persistence.remove();
      } finally {
        accessToken = null;
        refreshTokenCache = null;
        refreshTokenLoaded = true;
      }
    },
  };
}

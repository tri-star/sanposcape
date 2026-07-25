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
      // persistence の save/remove が失敗しても、同一プロセス内では最新値を使えるよう
      // メモリキャッシュは必ず更新する（clear() と同じ考え方）。
      try {
        if (token === null) {
          await persistence.remove();
        } else {
          await persistence.save(token);
        }
      } finally {
        refreshTokenCache = token;
        refreshTokenLoaded = true;
      }
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

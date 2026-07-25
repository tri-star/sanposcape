import type { AuthService, AuthUser } from "@/services/auth/types";

const DEFAULT_USER: AuthUser = {
  id: "mock-user-1",
  email: "mock@example.com",
  displayName: "モックユーザー",
  photoUrl: null,
};

const DEFAULT_ACCESS_TOKEN = "mock-access-token";

/**
 * mock: 通信を一切せず、メモリ上の固定ダミーで完結する（vitest 用）。
 * backend API 自体のモックは Orval 生成の MSW ハンドラが担当する（役割分担）。
 * ネットワーク前提の `createSessionAuthService` は使わず、単純な実装にする。
 */
export function createMockAuthService(options?: {
  user?: AuthUser;
  accessToken?: string;
}): AuthService {
  const user = options?.user ?? DEFAULT_USER;
  const accessToken = options?.accessToken ?? DEFAULT_ACCESS_TOKEN;

  let currentUser: AuthUser | null = null;

  return {
    async signIn() {
      currentUser = user;
      return user;
    },
    async restoreSession() {
      // 単体テストの既定として、未サインイン状態から始めるのが自然。
      return null;
    },
    async signOut() {
      currentUser = null;
    },
    getCurrentUser() {
      return currentUser;
    },
    async getAccessToken() {
      return accessToken;
    },
    async refreshAccessToken() {
      return accessToken;
    },
  };
}

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
 *
 * `onSessionChange` を real/dev と同じ形（`signIn` で user、`signOut` で null を通知）で
 * 受け取れるようにしているのは、`EXPO_PUBLIC_AUTH_MODE=mock` の開発ビルドでも
 * `useAuthSessionStore` へ状態が届き、`AuthGate` が機能するようにするため（SS-13 / ADR-009）。
 * `restoreSession()` は null を返すだけなので通知しない（real/dev の restoreSession 失敗時と揃える）。
 */
export function createMockAuthService(options?: {
  user?: AuthUser;
  accessToken?: string;
  onSessionChange?: (user: AuthUser | null) => void;
}): AuthService {
  const user = options?.user ?? DEFAULT_USER;
  const accessToken = options?.accessToken ?? DEFAULT_ACCESS_TOKEN;
  const onSessionChange = options?.onSessionChange;

  let currentUser: AuthUser | null = null;

  return {
    async signIn() {
      currentUser = user;
      onSessionChange?.(user);
      return user;
    },
    async restoreSession() {
      // 単体テストの既定として、未サインイン状態から始めるのが自然。
      return null;
    },
    async signOut() {
      currentUser = null;
      onSessionChange?.(null);
    },
    getCurrentUser() {
      return currentUser;
    },
    async getAccessToken() {
      return currentUser === null ? null : accessToken;
    },
    async refreshAccessToken() {
      return currentUser === null ? null : accessToken;
    },
  };
}

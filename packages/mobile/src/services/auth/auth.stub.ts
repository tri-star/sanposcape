import type { AuthService } from "@/services/auth/types";

/**
 * 認証のスタブ実装。
 * 単体テスト・（OAuthを再現できない）Maestro E2Eの両方で使う。常に成功扱いで即 resolve する。
 */
export const authServiceStub: AuthService = {
  async signIn() {
    // 静的実装のため何もしない（常に成功）。
  },
  async signUp() {
    // 静的実装のため何もしない（常に成功）。
  },
  async signOut() {
    // 静的実装のため何もしない（常に成功）。
  },
};

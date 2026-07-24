import type { AuthService } from "@/services/auth/types";

/**
 * 認証の本番実装（TODO）。
 * 実際の OAuth/OIDC 連携は別タスクで実装する。それまでは呼び出されても
 * 分かりやすく失敗させ、real/stub の切り替え漏れに気づけるようにする。
 */
export const authServiceReal: AuthService = {
  async signIn() {
    throw new Error("authServiceReal.signIn is not implemented yet");
  },
  async signUp() {
    throw new Error("authServiceReal.signUp is not implemented yet");
  },
  async signOut() {
    throw new Error("authServiceReal.signOut is not implemented yet");
  },
};

import type { AuthApi } from "@/services/auth/authApi";
import { createSessionAuthService } from "@/services/auth/createSessionAuthService";
import { signInWithGoogle, signOutFromGoogle } from "@/services/auth/googleSignIn";
import type { AuthService, AuthUser, TokenStore } from "@/services/auth/types";

/**
 * real: Google のネイティブサインイン → POST /auth/session でアプリ自前トークンへ交換する。
 *
 * 従来の `export const authServiceReal` （オブジェクト定数）ではなくファクトリ関数にしている。
 * `index.ts` で `tokenStore` / `api` を組み立てて注入するための DI であり、
 * 既存の「オブジェクト定数を export」する規約からの逸脱だが、
 * テスト容易性（`createSessionAuthService` へのフェイク注入）を優先した判断。
 */
export function createRealAuthService(deps: {
  tokenStore: TokenStore;
  api: AuthApi;
  onSessionChange?: (user: AuthUser | null) => void;
}): AuthService {
  return createSessionAuthService({
    issueSession: async (provider) => {
      const idToken = await signInWithGoogle();
      return deps.api.createSession({ provider, idToken });
    },
    api: deps.api,
    tokenStore: deps.tokenStore,
    onSignOut: signOutFromGoogle,
    onSessionChange: deps.onSessionChange,
  });
}

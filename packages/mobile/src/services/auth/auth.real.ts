import { createAppleNonce } from "@/services/auth/appleNonce";
import { createAppleSessionIssuer } from "@/services/auth/appleSession";
import { requestAppleCredential } from "@/services/auth/appleSignIn";
import type { AuthApi } from "@/services/auth/authApi";
import { AuthError } from "@/services/auth/authError";
import { createSessionAuthService } from "@/services/auth/createSessionAuthService";
import { signInWithGoogle, signOutFromGoogle } from "@/services/auth/googleSignIn";
import type {
  AuthService,
  AuthUser,
  PendingAppleDisplayNameStore,
  TokenStore,
} from "@/services/auth/types";

/**
 * real: Google / Apple のネイティブサインイン → POST /auth/session でアプリ自前トークンへ交換する。
 *
 * 従来の `export const authServiceReal` （オブジェクト定数）ではなくファクトリ関数にしている。
 * `index.ts` で `tokenStore` / `api` を組み立てて注入するための DI であり、
 * 既存の「オブジェクト定数を export」する規約からの逸脱だが、
 * テスト容易性（`createSessionAuthService` へのフェイク注入）を優先した判断。
 */
export function createRealAuthService(deps: {
  tokenStore: TokenStore;
  api: AuthApi;
  pendingAppleDisplayName: PendingAppleDisplayNameStore;
  onSessionChange?: (user: AuthUser | null) => void;
}): AuthService {
  const issueAppleSession = createAppleSessionIssuer({
    createNonce: () => createAppleNonce(),
    requestCredential: requestAppleCredential,
    pendingDisplayName: deps.pendingAppleDisplayName,
    api: deps.api,
  });

  return createSessionAuthService({
    issueSession: async (provider) => {
      switch (provider) {
        case "google": {
          const idToken = await signInWithGoogle();
          return deps.api.createSession({ provider, idToken });
        }
        case "apple":
          return issueAppleSession();
        default: {
          const unsupported: never = provider;
          throw new AuthError("configuration", `Unsupported provider: ${String(unsupported)}`);
        }
      }
    },
    api: deps.api,
    tokenStore: deps.tokenStore,
    // Apple ユーザーでも呼んで害は無い（Google のセッションが無ければ何もしない。失敗は signOut 側で握りつぶす）。
    onSignOut: signOutFromGoogle,
    onSessionChange: deps.onSessionChange,
  });
}

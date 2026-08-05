import { getDevUserKey } from "@/config/authEnv";
import type { AuthApi } from "@/services/auth/authApi";
import { createSessionAuthService } from "@/services/auth/createSessionAuthService";
import type { AuthService, AuthUser, TokenStore } from "@/services/auth/types";

/**
 * dev: backend の POST /auth/dev-session で開発用ユーザーのトークンを得る。
 * Google には一切触れない。トークン発行以降のコードパス（Bearer 送信・refresh・
 * backend の get_current_user）は real と完全に同一（ADR-002 決定3）。
 * ローカル開発 / Maestro E2E で使う。
 *
 * backend が AUTH_MODE=dev でないと 404 が返る。`toAuthError` が "configuration" に分類するので、
 * UI で「開発用サインインが有効になっていません」と出せる。
 */
export function createDevAuthService(deps: {
  tokenStore: TokenStore;
  api: AuthApi;
  onSessionChange?: (user: AuthUser | null) => void;
}): AuthService {
  return createSessionAuthService({
    // provider 引数は無視する（開発用ユーザーは provider に依存しない）。
    issueSession: () => deps.api.createDevSession({ userKey: getDevUserKey() }),
    api: deps.api,
    tokenStore: deps.tokenStore,
    onSessionChange: deps.onSessionChange,
  });
}

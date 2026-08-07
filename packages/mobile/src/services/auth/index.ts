import { setAuthTokenProvider } from "@/api/authTokenProvider";
import { getAuthMode } from "@/config/authMode";
import { createAuthApi } from "@/services/auth/authApi";
import { createDevAuthService } from "@/services/auth/auth.dev";
import { createMockAuthService } from "@/services/auth/auth.mock";
import { createRealAuthService } from "@/services/auth/auth.real";
import { configureGoogleSignIn } from "@/services/auth/googleSignIn";
import { createMemoryRefreshTokenPersistence } from "@/services/auth/tokenStore.memory";
import { secureRefreshTokenPersistence } from "@/services/auth/tokenStore.secure";
import { createTokenStore } from "@/services/auth/tokenStore";
import type { AuthService, AuthUser } from "@/services/auth/types";
import { useAuthSessionStore } from "@/store/useAuthSessionStore";

export type { AuthProvider, AuthService, AuthUser } from "@/services/auth/types";
export { AuthError, isAuthError } from "@/services/auth/authError";

const mode = getAuthMode();

// mock は「テスト専用の認証バイパス」なので、実端末の非開発ビルドで有効化されたら即座に落とす（fail-safe）。
if (mode === "mock" && !__DEV__ && process.env.NODE_ENV !== "test") {
  throw new Error("EXPO_PUBLIC_AUTH_MODE=mock is not allowed in a non-development build");
}

const tokenStore = createTokenStore(
  mode === "mock" ? createMemoryRefreshTokenPersistence() : secureRefreshTokenPersistence,
);
const api = createAuthApi();

/**
 * サービス層のセッション変化をアプリ状態へ橋渡しする（SS-13 / ADR-009）。
 * ここが唯一の配線点なので、401 → refresh 失敗によるセッション破棄も UI に届く。
 * `initAuth()` が `@/api/authTokenProvider` へトークン供給者を登録するのと同じ
 * 「バレル＝認証の合成ルート」という役割に沿う。
 * `useAuthSessionStore` は zustand のみに依存する純粋モジュールで、
 * `AuthUser` を型のみ import しているため実行時の循環参照は生じない。
 */
const notifySessionChange = (user: AuthUser | null): void => {
  useAuthSessionStore.getState().setSession(user);
};

/**
 * real/dev/mock の選択。モード判定は `getAuthMode()` の1箇所に集約する
 * （他ファイルで `process.env.EXPO_PUBLIC_AUTH_MODE` を読まない）。
 *
 * `dev` / `mock` の実装が production バンドルに含まれること自体は許容する（Metro の
 * tree-shaking は保証されない）。安全性は「既定 real」＋「mock の起動時ガード」＋
 * 「backend 側で AUTH_MODE != dev なら /auth/dev-session が存在しない」の三重で担保する
 * （ADR-002 決定4）。
 */
export const authService: AuthService =
  mode === "mock"
    ? createMockAuthService({ onSessionChange: notifySessionChange })
    : mode === "dev"
      ? createDevAuthService({ tokenStore, api, onSessionChange: notifySessionChange })
      : createRealAuthService({ tokenStore, api, onSessionChange: notifySessionChange });

let initialized = false;

/**
 * アプリ起動時に1回だけ呼ぶ初期化。
 * - api クライアントへトークン供給者を登録する（これを呼ばないと Bearer が付かない）
 * - real モードなら Google SDK を configure する
 * 冪等。セッション復元（restoreSession）は `features/auth/hooks/useAuthSessionBootstrap.ts`
 * （`app/_layout.tsx` の `AuthGate`）の責務（SS-13 / ADR-009。SS-11 時点はスプラッシュの責務だった）。
 */
export function initAuth(): void {
  if (initialized) return;
  initialized = true;
  if (mode === "real") configureGoogleSignIn();
  setAuthTokenProvider({
    getAccessToken: () => authService.getAccessToken(),
    refreshAccessToken: () => authService.refreshAccessToken(),
  });
}

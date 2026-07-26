import { createSingleFlight } from "@/lib/singleFlight";
import type { AuthApi } from "@/services/auth/authApi";
import { toAuthError } from "@/services/auth/authError";
import { toSession } from "@/services/auth/sessionMapper";
import { isAccessTokenExpired } from "@/services/auth/tokenExpiry";
import type { AuthProvider, AuthService, AuthUser, TokenStore } from "@/services/auth/types";

export type SessionAuthDeps = {
  /** トークンの発行元。real=Google→/auth/session、dev=/auth/dev-session。ここだけが real/dev の差分。 */
  issueSession: (provider: AuthProvider) => Promise<unknown>;
  api: Pick<AuthApi, "refresh" | "logout">;
  tokenStore: TokenStore;
  /** テスト注入用。既定 () => Date.now()。 */
  now?: () => number;
  /** サインアウト時の追加処理（real は Google のネイティブセッションも破棄）。 */
  onSignOut?: () => Promise<void>;
  /** セッション変化の通知（SS-13 の継ぎ目。本タスクでは未使用でよい）。 */
  onSessionChange?: (user: AuthUser | null) => void;
  /** 起動時セッション復元の上限時間（ms）。テストでは短縮できる。 */
  restoreTimeoutMs?: number;
};

const DEFAULT_RESTORE_TIMEOUT_MS = 10_000;

/**
 * real / dev で完全に共通のトークン生存管理を実装する。
 * ADR-002 決定3の「継ぎ目はトークンの発行元だけ」を体現する。
 * `react-native` / ネイティブモジュールを一切 import しない（すべて DI）。
 */
export function createSessionAuthService(deps: SessionAuthDeps): AuthService {
  const { issueSession, api, tokenStore, onSignOut, onSessionChange } = deps;
  const now = deps.now ?? (() => Date.now());
  const restoreTimeoutMs = deps.restoreTimeoutMs ?? DEFAULT_RESTORE_TIMEOUT_MS;

  let currentUser: AuthUser | null = null;

  function setCurrentUser(user: AuthUser | null): void {
    currentUser = user;
    onSessionChange?.(user);
  }

  async function doRefresh(signal?: AbortSignal): Promise<string | null> {
    const refreshToken = await tokenStore.getRefreshToken();
    if (refreshToken === null || signal?.aborted) {
      return null;
    }

    // refreshAccessToken() は throw しない契約（client.ts はこの戻り値のみを見てリトライを諦める）。
    // そのため api.refresh の通信/検証エラーをすべてここで吸収する。
    try {
      const raw = signal
        ? await api.refresh(refreshToken, { signal })
        : await api.refresh(refreshToken);
      // fetch 実装が abort を遅れて処理しても、切断済みの復元が後から状態を書き換えないようにする。
      if (signal?.aborted) return null;
      const session = toSession(raw, now());
      if (signal?.aborted) return null;

      tokenStore.setAccessToken(session.accessToken);
      // ローテーションされた refresh token を必ず保存する。
      await tokenStore.setRefreshToken(session.refreshToken);
      if (signal?.aborted) return null;
      setCurrentUser(session.user);

      return session.accessToken.value;
    } catch (error) {
      const authError = toAuthError(error);
      if (authError.code === "unauthorized") {
        // refresh token が失効/再利用検知された = 復帰不能。再サインインが必要な状態へ落とす。
        //
        // tokenStore.clear() は SecureStore 側の削除(persistence.remove())が失敗すると
        // 例外を re-throw する契約（tokenStore.test.ts で固定）。ここで re-throw をそのまま
        // 伝播させると catch を貫通し、「refreshAccessToken() は throw しない」契約
        // （client.ts が戻り値 null のみを見てリトライを諦める前提）を破ってしまう。
        // clear() の finally で access token / refresh token のメモリ上の状態は既に
        // 破棄済み = セッション破棄自体は成立しているため、SecureStore 側の削除失敗は
        // catch して握りつぶしてよい。残留した refresh token は次回起動時に backend 側で
        // 失効済み（401）→ 再度 clear() が呼ばれて自己修復する。
        try {
          await tokenStore.clear();
        } catch {
          // 上記コメントの通り、意図的に握りつぶす。
        }
        setCurrentUser(null);
      }
      // それ以外（ネットワークエラー・レスポンス不正等）はセッションを保持したまま null を返す
      // （一時的失敗でログアウトさせない）。
      return null;
    }
  }

  const refreshSingleFlight = createSingleFlight(() => doRefresh());

  return {
    async signIn(provider: AuthProvider): Promise<AuthUser> {
      try {
        const raw = await issueSession(provider);
        const session = toSession(raw, now());
        tokenStore.setAccessToken(session.accessToken);
        await tokenStore.setRefreshToken(session.refreshToken);
        setCurrentUser(session.user);
        return session.user;
      } catch (error) {
        throw toAuthError(error);
      }
    },

    async getAccessToken(): Promise<string | null> {
      const accessToken = tokenStore.getAccessToken();
      if (accessToken !== null && !isAccessTokenExpired(accessToken, now())) {
        return accessToken.value;
      }
      return refreshSingleFlight();
    },

    async refreshAccessToken(): Promise<string | null> {
      return refreshSingleFlight();
    },

    async restoreSession(options): Promise<AuthUser | null> {
      const controller = new AbortController();
      const abort = () => controller.abort();
      options?.signal?.addEventListener("abort", abort, { once: true });
      if (options?.signal?.aborted) abort();
      const timeout = setTimeout(abort, restoreTimeoutMs);

      // 起動時復元は中断可能な専用経路にする。通常の API refresh と共有すると、画面破棄後にも
      // single-flight の完了が認証状態を書き換えられるためである。
      let token: string | null;
      let removeAbortListener: (() => void) | undefined;
      const aborted = new Promise<null>((resolve) => {
        const onAbort = () => resolve(null);
        controller.signal.addEventListener("abort", onAbort, { once: true });
        removeAbortListener = () => controller.signal.removeEventListener("abort", onAbort);
        if (controller.signal.aborted) onAbort();
      });
      try {
        // signal を無視する fetch 実装でも、起動遷移そのものは上限時間で必ず進める。
        // doRefresh 側の aborted 判定により、後から返った通信結果は状態を更新できない。
        token = await Promise.race([doRefresh(controller.signal), aborted]);
      } finally {
        clearTimeout(timeout);
        options?.signal?.removeEventListener("abort", abort);
        removeAbortListener?.();
      }
      if (token === null) {
        return null;
      }
      return currentUser;
    },

    async signOut(): Promise<void> {
      const refreshToken = await tokenStore.getRefreshToken();
      if (refreshToken !== null) {
        try {
          await api.logout(refreshToken);
        } catch {
          // 失敗しても握りつぶす（ローカルは必ずクリアする）。
        }
      }
      if (onSignOut) {
        try {
          await onSignOut();
        } catch {
          // 失敗しても握りつぶす。
        }
      }
      try {
        // tokenStore.clear() は SecureStore 側の削除が失敗すると re-throw する契約。
        // clear() 内の finally でメモリ上のトークンは既に破棄済み＝ローカルセッション破棄は
        // 成立しているため、SecureStore 側の削除失敗で signOut() 自体を失敗させない
        // （doRefresh() の 401 経路と同じ理由。詳細はそちらのコメント参照）。
        await tokenStore.clear();
      } catch {
        // 意図的に握りつぶす。
      }
      setCurrentUser(null);
    },

    getCurrentUser(): AuthUser | null {
      return currentUser;
    },
  };
}

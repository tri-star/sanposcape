import type { SessionRead } from "@/api/generated/model";

/** 認証プロバイダ。追加時は backend の provider フィールドに対応値を足す（ADR-002 決定2）。 */
export type AuthProvider = "google";

/** アプリが扱うユーザー表現。トークンは含めない（UI へトークンを漏らさない）。 */
export type AuthUser = {
  id: string;
  email: string | null;
  displayName: string | null;
  photoUrl: string | null;
};

/**
 * 認証サービスのインターフェース。
 * 呼び出し側（features/auth など）はこれのみを参照し、real/dev/mock の実体を知らない。
 * ゲストは「メソッド」ではなく「トークン非保持状態」= getCurrentUser() === null として表現する（ADR-002 決定6）。
 */
export type AuthService = {
  /** サインイン（新規登録との区別なし。backend が JIT でユーザーを作る）。 */
  signIn(provider: AuthProvider): Promise<AuthUser>;
  /**
   * 起動時のセッション復元。保存済み refresh token が無効/不在なら null。
   * signal を abort すると、通信が後から完了しても認証状態を更新しない。
   */
  restoreSession(options?: { signal?: AbortSignal }): Promise<AuthUser | null>;
  /** サインアウト。backend の refresh token 失効 + ローカル破棄。 */
  signOut(): Promise<void>;
  /** 現在のユーザー（同期）。未認証なら null。 */
  getCurrentUser(): AuthUser | null;
  /** 有効な access token。期限切れなら内部で refresh する。未認証なら null。 */
  getAccessToken(): Promise<string | null>;
  /** 強制 refresh（401 を受けた client から呼ばれる）。single-flight。失敗時 null。 */
  refreshAccessToken(): Promise<string | null>;
};

/** メモリ上の access token。 */
export type AccessToken = {
  value: string;
  /** 失効時刻（epoch ms）。 */
  expiresAt: number;
};

/**
 * トークン保管の抽象。
 * access token はメモリのみ（永続化しない）、refresh token は永続層に委譲する。
 */
export type TokenStore = {
  getAccessToken(): AccessToken | null;
  setAccessToken(token: AccessToken | null): void;
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string | null): Promise<void>;
  /** access/refresh 両方を破棄する。 */
  clear(): Promise<void>;
};

/** refresh token の永続化先（SecureStore or メモリ）。 */
export type RefreshTokenPersistence = {
  load(): Promise<string | null>;
  save(token: string): Promise<void>;
  remove(): Promise<void>;
};

/**
 * backend の /auth/* が返すトークンレスポンス（ワイヤ形式）。
 * backend は snake_case で返すため、**この型だけが snake_case**。
 * camelCase への変換は sessionMapper.toSession() が境界で1回だけ行う。
 *
 * `/auth/dev-session` は OpenAPI に載らない（`include_in_schema=False`）ため、
 * この型はローカル定義として恒久的に必要（`/auth/session` `/auth/refresh` `/auth/me` については
 * Orval 生成モデルと構造が一致するため、型突き合わせで乖離を検知できる）。
 */
export type SessionTokensResponse = {
  access_token: string;
  /** access token の有効期間（秒）。 */
  expires_in: number;
  refresh_token: string;
  user: AuthUserResponse;
};

/** backend が返すユーザー表現（ワイヤ形式・snake_case）。GET /auth/me も同一スキーマ。 */
export type AuthUserResponse = {
  id: string;
  email: string | null;
  display_name: string | null;
  photo_url: string | null;
};

/** 認証エラーの分類。 */
export type AuthErrorCode = "cancelled" | "unauthorized" | "network" | "configuration" | "unknown";

/**
 * `SessionTokensResponse` が Orval 生成モデル（`SessionRead`）と乖離していないことを型レベルで
 * 守るためのアサーション（§7.7）。乖離すると typecheck が落ちるので早期に気づける。
 * 生成物は gitignore されているため `pnpm --filter mobile orval` 実行後にのみ意味を持つ。
 * 実際に呼ばれることはなく、型検査のためだけに存在する。
 */
export function _assertSessionWireShape(session: SessionTokensResponse): SessionRead {
  return session;
}

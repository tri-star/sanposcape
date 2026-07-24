/** 認証方法。 */
export type AuthMethod = "google" | "guest";

/**
 * 認証サービスのインターフェース。
 * 呼び出し側（`src/features/auth`）はこのインターフェースのみを参照し、
 * real / stub の実体を意識しない（`docs/architecture-guideline.md` のスタブ差し替え方針）。
 */
export type AuthService = {
  signIn(method: AuthMethod): Promise<void>;
  signUp(method: AuthMethod): Promise<void>;
  signOut(): Promise<void>;
};

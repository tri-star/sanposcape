/**
 * `client.ts` から `services/auth` への直接依存を断ち切るレジストリ。
 *
 * なぜ必要か（重要な設計判断）:
 * 1. `services/auth` → `authApi` は HTTP を使い、`client.ts` → 認証は token を使うため、
 *    直接 import すると循環参照になる。
 * 2. `client.ts` が `services/auth/index.ts` を import すると、`expo-secure-store` /
 *    `react-native-nitro-google-signin` が芋づるで読み込まれ、node 環境の vitest
 *    （既存 `client.test.ts`）が壊れる。
 *
 * `react-native` に依存しない。
 */
export type AuthTokenProvider = {
  /** 有効な access token（必要なら内部で refresh 済み）。未認証なら null。 */
  getAccessToken(): Promise<string | null>;
  /** 401 を受けた後に強制 refresh する。single-flight であること。失敗時は null。 */
  refreshAccessToken(): Promise<string | null>;
};

let current: AuthTokenProvider | null = null;

/** アプリ起動時に services/auth から登録する。テストではフェイクを登録する。 */
export function setAuthTokenProvider(provider: AuthTokenProvider | null): void {
  current = provider;
}

export function getAuthTokenProvider(): AuthTokenProvider | null {
  return current;
}

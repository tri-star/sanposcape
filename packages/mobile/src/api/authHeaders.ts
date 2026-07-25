/**
 * `RequestInit` に `Authorization` を付ける純粋関数。
 * `client.ts` の分岐をテスト可能にするため切り出す。
 */

/** token が null なら options をそのまま返す。既存 headers は保持する。 */
export function withAuthHeader(options: RequestInit, token: string | null): RequestInit {
  if (token === null) {
    return options;
  }

  // Headers インスタンス / Record<string,string> / [string,string][] のいずれも正規化できる。
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);

  // 元の options を破壊しない（リトライ時に同じ options を再利用するため必須）。
  return { ...options, headers };
}

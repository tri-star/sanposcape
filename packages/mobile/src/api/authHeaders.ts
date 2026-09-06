/**
 * `RequestInit` に `X-App-Authorization` を付ける純粋関数。
 * `client.ts` の分岐をテスト可能にするため切り出す。
 */

/**
 * アクセストークンを運ぶ独自ヘッダー。
 * CloudFront(OAC, SigningBehavior: always) はオリジンへの SigV4 署名を `Authorization` に入れるため、
 * ビューアが送った `Authorization` はオリジンに届かない
 * （`docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md` 決定4）。
 * backend は `X-App-Authorization` → `Authorization` の順で読む
 * （`packages/backend/src/sanposcape/auth/headers.py`）。
 */
export const APP_AUTHORIZATION_HEADER = "X-App-Authorization";

/** token が null なら options をそのまま返す。既存 headers は保持する。 */
export function withAuthHeader(options: RequestInit, token: string | null): RequestInit {
  if (token === null) {
    return options;
  }

  // Headers インスタンス / Record<string,string> / [string,string][] のいずれも正規化できる。
  const headers = new Headers(options.headers);
  headers.set(APP_AUTHORIZATION_HEADER, `Bearer ${token}`);

  // 元の options を破壊しない（リトライ時に同じ options を再利用するため必須）。
  return { ...options, headers };
}

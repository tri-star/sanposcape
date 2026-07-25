/**
 * 認証に必要な環境変数の読み取りをまとめる。
 * OAuth のクライアントIDは秘密情報ではないため EXPO_PUBLIC_ で問題ない
 * （client_secret は使わない = public client）。client_secret を EXPO_PUBLIC_ に置くことは絶対に禁止。
 */

/** Google の Web クライアントID。Android/iOS ともに ID token の aud に使うため必須。 */
export function getGoogleWebClientId(): string | null {
  const value = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
  return value ? value : null;
}

/** iOS 用クライアントID（未設定なら null）。 */
export function getGoogleIosClientId(): string | null {
  const value = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  return value ? value : null;
}

/** dev モードで backend に渡す開発用ユーザーキー。未設定時は "dev-user-1"。 */
export function getDevUserKey(): string {
  const value = process.env.EXPO_PUBLIC_DEV_USER_KEY;
  return value ? value : "dev-user-1";
}

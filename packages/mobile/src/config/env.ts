/**
 * 環境変数の読み取り。
 * Expo は EXPO_PUBLIC_ 接頭辞の変数のみをクライアントへ公開する。
 */
export function getApiBaseUrl(): string {
  const url = process.env.EXPO_PUBLIC_BACKEND_API_URL;
  if (!url) {
    // .env 未設定時の開発フォールバック
    return "http://localhost:8000";
  }
  return url;
}

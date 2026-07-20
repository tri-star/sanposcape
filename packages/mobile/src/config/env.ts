import { Platform } from "react-native";

/**
 * 環境変数の読み取り。
 * Expo は EXPO_PUBLIC_ 接頭辞の変数のみをクライアントへ公開する。
 */
export function getApiBaseUrl(): string {
  let url = process.env.EXPO_PUBLIC_BACKEND_API_URL;
  if (!url) {
    // .env 未設定時の開発フォールバック
    url = "http://localhost:8000";
  }
  // Android エミュレータ環境では localhost を 10.0.2.2 に置換してホストマシンに接続できるようにする
  if (Platform.OS === "android" && url.includes("localhost")) {
    return url.replace("localhost", "10.0.2.2");
  }
  return url;
}

/**
 * 開発用カタログ画面(`/(dev)/catalog`)を有効にするか。
 * `__DEV__`(RN のグローバル)か、`EXPO_PUBLIC_ENABLE_CATALOG=true` のとき有効。
 * preview ビルド(E2E用)でも確認したいことがあるため env でも開けるようにする。
 * `__DEV__` は vitest(node)には存在しないため、`src/test/setup.ts` で
 * `globalThis.__DEV__ = false` を定義し、テスト側は `vi.stubGlobal` で上書きする。
 */
export function isCatalogEnabled(): boolean {
  return process.env.EXPO_PUBLIC_ENABLE_CATALOG === "true" || __DEV__ === true;
}

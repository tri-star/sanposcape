/**
 * ビルドの種類（variant）の解析と、開発ツールを開いてよいかの判定（SS-148）。
 * 純粋関数だけを置く（`react-native` / `expo-*` を値 import しない。Vitest 対象）。
 * 実行時の値を読んで渡す入口は `src/config/devTools.ts`。
 *
 * 判定順は `isDevToolsAllowed` を参照。シグナルを2つ（`extra.appVariant` と `Updates.channel`）にするのは、
 * OTA の update で起動すると `Constants.expoConfig` が update の manifest 由来になり、
 * `eas update` は `eas.json` のビルドプロファイルの `env`（`APP_VARIANT=production`）を読まないため、
 * `extra` だけだと本番端末で `"development"` に変わりうる（fail-open）から。
 * `Updates.channel` はネイティブ設定で OTA では変わらない。詳細は mobile ADR-007 の SS-148 追補。
 */

/** app.config.ts が extra.appVariant に書く値（APP_VARIANT=production → "production"、未設定 → "development"）。 */
export type AppVariant = "production" | "development";

/**
 * 本番ビルドの EAS Update チャネル名。eas.json の build.production.channel と一致させる
 * （appVariant.test.ts が eas.json と照合する）。
 */
export const PRODUCTION_UPDATES_CHANNEL = "production";

/** 完全一致だけを受け付ける。大文字小文字・前後空白は救済しない（未知 = null = 非表示へ倒す）。 */
export function parseAppVariant(raw: unknown): AppVariant | null {
  return raw === "production" || raw === "development" ? raw : null;
}

export type DevToolsAccessInput = {
  /** `__DEV__`。 */
  isDev: boolean;
  appVariant: AppVariant | null;
  /** `Updates.channel`。dev build では null。 */
  updatesChannel: string | null;
};

/**
 * 開発ツール（画面カタログ・デザインシステム）を開いてよいビルドか。判定順（この順序が仕様）:
 * 1. `isDev` → 許可（Metro の開発バンドルは本番端末で動かない）
 * 2. `appVariant === "production"` → 不許可
 * 3. `updatesChannel === "production"` → 不許可
 * 4. `appVariant === "development"` → 許可
 * 5. それ以外（`extra` が無い・未知の値）→ 不許可（fail-closed）
 */
export function isDevToolsAllowed(input: DevToolsAccessInput): boolean {
  if (input.isDev) return true;
  if (input.appVariant === "production") return false;
  if (input.updatesChannel === PRODUCTION_UPDATES_CHANNEL) return false;
  return input.appVariant === "development";
}

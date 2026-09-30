import Constants from "expo-constants";
import * as Updates from "expo-updates";

import { isDevToolsAllowed, parseAppVariant } from "@/config/appVariant";

/** 起動中に変わらない値なので、モジュール評価時に1回だけ決める。 */
const DEV_TOOLS_ENABLED = isDevToolsAllowed({
  isDev: __DEV__,
  appVariant: parseAppVariant(Constants.expoConfig?.extra?.appVariant),
  updatesChannel: Updates.channel ?? null,
});

/**
 * 開発ツール（/dev-screens・/design-system と、アカウントタブの「画面カタログ」ボタン）を出してよいビルドか。
 * 判定の実体は `appVariant.ts` の `isDevToolsAllowed`（mobile ADR-007 の SS-148 追補）。
 *
 * ビルドの種類で分岐してよいのは開発ツールの表示可否だけ。プロダクトの挙動の分岐には使わない
 * （使い道を増やすと、本番と staging で挙動が違う機能が生まれるため）。
 *
 * ネイティブモジュール（expo-constants / expo-updates）に依存するので Vitest の対象にしない。
 * テストされるモジュール（`lib/` や `api/` など）から import しないこと。import してよいのは `app/` のルートだけ。
 */
export function isDevToolsEnabled(): boolean {
  return DEV_TOOLS_ENABLED;
}

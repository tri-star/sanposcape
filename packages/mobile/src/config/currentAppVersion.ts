import * as Application from "expo-application";
import Constants from "expo-constants";
import * as Updates from "expo-updates";

/**
 * 実行中のアプリのバージョン（app.json の `version`）。起動中に変わらないので、モジュール評価時に1回だけ読む。
 * 読む側は最低サポートバージョンの判定（`useUpdateRequired`、SS-101）と設定画面の表示（SS-228）。
 *
 * `Constants.expoConfig.version` は OTA の update で起動すると update の manifest の値になるが、
 * `runtimeVersion.policy` が `appVersion`（app.json）なので、update は同じ `version` のバイナリにしか届かない。
 * そのためバイナリの `version` と一致する。SS-230 で `expo-application` を入れたが、`version` はこれまでどおりここで読む
 * （判定と表示で同じ値を1か所で読むため。ADR-M-020 の SS-230 追補）。
 *
 * このファイルの値はどれもネイティブモジュール（expo-constants / expo-application / expo-updates）に依存するので、
 * Vitest の対象（`lib/` や `api/` など）から import しないこと。
 */
export const CURRENT_APP_VERSION: string | null = Constants.expoConfig?.version ?? null;

/**
 * ネイティブのビルド番号（iOS の `CFBundleVersion` / Android の `versionCode`。SS-230）。
 * EAS が採番してビルド時にネイティブへ書くので（`appVersionSource: remote`）、app config には無い。
 */
export const CURRENT_APP_BUILD_NUMBER: string | null = Application.nativeBuildVersion;

/** EAS Update のチャネル（ネイティブ設定なので OTA では変わらない）。development build では null。 */
export const CURRENT_UPDATES_CHANNEL: string | null = Updates.channel ?? null;

/**
 * OTA の update で起動しているときの update ID（SS-230）。
 * `Updates.updateId` はストアのバイナリに入っている JS で起動したときも値を持つので、そのときは null にする。
 * development build（Metro）では expo-updates が無効で null。
 */
export const CURRENT_OTA_UPDATE_ID: string | null = Updates.isEmbeddedLaunch
  ? null
  : (Updates.updateId ?? null);

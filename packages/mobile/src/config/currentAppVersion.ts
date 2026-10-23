import Constants from "expo-constants";

/**
 * 実行中のアプリのバージョン（app.json の `version`）。起動中に変わらないので、モジュール評価時に1回だけ読む。
 * 読む側は最低サポートバージョンの判定（`useUpdateRequired`、SS-101）と設定画面の表示（SS-228）。
 *
 * `Constants.expoConfig.version` は OTA の update で起動すると update の manifest の値になるが、
 * `runtimeVersion.policy` が `appVersion`（app.json）なので、update は同じ `version` のバイナリにしか届かない。
 * そのためバイナリの `version` と一致する。`expo-application` の `nativeApplicationVersion` は
 * ネイティブ依存の追加（development build の作り直し）になるので使わない（ADR-008 の SS-101 追補）。
 *
 * ネイティブモジュール（expo-constants）に依存するので、Vitest の対象（`lib/` や `api/` など）から import しないこと。
 */
export const CURRENT_APP_VERSION: string | null = Constants.expoConfig?.version ?? null;

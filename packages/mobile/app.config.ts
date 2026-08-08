import type { ConfigContext, ExpoConfig } from "expo/config";
import { withAppBuildGradle } from "expo/config-plugins";

/**
 * app.json を拡張し、Google Maps の SDK キーを環境変数から注入する。
 * キーはリポジトリにコミットしない（ADR-001: mobile 用 SDK key と backend の server key は分離する）。
 * - Android: Maps SDK for Android のキーが無いと地図が灰色のまま描画されない。
 * - iOS: 既定の Apple Maps を使うためキー不要（PROVIDER_GOOGLE を使う場合のみ必要）。
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const androidKey = process.env.GOOGLE_MAPS_ANDROID_SDK_KEY;
  return withDisableAndroidLintVital({
    ...config,
    name: config.name ?? "sanposcape",
    slug: config.slug ?? "sanposcape",
    android: {
      ...config.android,
      ...(androidKey ? { config: { googleMaps: { apiKey: androidKey } } } : {}),
    },
  });
};

/**
 * assembleRelease に自動付随する lintVitalAnalyzeRelease を無効化する。
 * E2E用のpreviewビルド(内部配布のみ)にリリース前品質ゲートは不要な一方、
 * ネイティブモジュール数の多さでGradleがMetaspace OOMを起こしCIがハングする原因になっていた
 * （ADR-004 SS-44追補参照）。
 */
function withDisableAndroidLintVital(config: ExpoConfig): ExpoConfig {
  return withAppBuildGradle(config, (config) => {
    if (!config.modResults.contents.includes("checkReleaseBuilds")) {
      config.modResults.contents = config.modResults.contents.replace(
        /^android \{/m,
        "android {\n    lint {\n        checkReleaseBuilds = false\n    }\n",
      );
    }
    return config;
  });
}

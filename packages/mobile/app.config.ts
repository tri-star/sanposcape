import type { ConfigContext, ExpoConfig } from "expo/config";
import { withAndroidManifest, withAppBuildGradle } from "expo/config-plugins";

/**
 * app.json を拡張し、Google Maps の SDK キーを環境変数から注入する。
 * キーはリポジトリにコミットしない（ADR-001: mobile 用 SDK key と backend の server key は分離する）。
 * - Android: Maps SDK for Android のキーが無いと地図が灰色のまま描画されない。
 * - iOS: 既定の Apple Maps を使うためキー不要（PROVIDER_GOOGLE を使う場合のみ必要）。
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const androidKey = process.env.GOOGLE_MAPS_ANDROID_SDK_KEY;
  return withCleartextTrafficForHttpBackend(
    withDisableAndroidLintVital({
      ...config,
      name: config.name ?? "sanposcape",
      slug: config.slug ?? "sanposcape",
      android: {
        ...config.android,
        ...(androidKey ? { config: { googleMaps: { apiKey: androidKey } } } : {}),
      },
    }),
  );
};

/**
 * バックエンドURLが http:// の場合のみ usesCleartextTraffic を有効化する。
 * preview(E2E) プロファイルは eas.json で EXPO_PUBLIC_BACKEND_API_URL=http://10.0.2.2:8000 を
 * 注入している一方、このプロファイルは developmentClient を使わない release 相当のビルドのため、
 * デバッグビルドが自動で得る cleartext 許可（RNのdebug用network_security_config）が効かない。
 * その結果 preview の実機/エミュレータで dev-session 等へのHTTP通信が黙って失敗していた
 * （Maestro E2E: サインイン後 walk-start-screen に遷移しない, SS-44追補）。
 * https:// を使う production では何もしない。
 */
function withCleartextTrafficForHttpBackend(config: ExpoConfig): ExpoConfig {
  if (!process.env.EXPO_PUBLIC_BACKEND_API_URL?.startsWith("http://")) {
    return config;
  }
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (application) {
      application.$["android:usesCleartextTraffic"] = "true";
    }
    return config;
  });
}

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

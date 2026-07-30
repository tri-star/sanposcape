import type { ConfigContext, ExpoConfig } from "expo/config";

/**
 * app.json を拡張し、Google Maps の SDK キーを環境変数から注入する。
 * キーはリポジトリにコミットしない（ADR-001: mobile 用 SDK key と backend の server key は分離する）。
 * - Android: Maps SDK for Android のキーが無いと地図が灰色のまま描画されない。
 * - iOS: 既定の Apple Maps を使うためキー不要（PROVIDER_GOOGLE を使う場合のみ必要）。
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const androidKey = process.env.GOOGLE_MAPS_ANDROID_SDK_KEY;
  return {
    ...config,
    name: config.name ?? "sanposcape",
    slug: config.slug ?? "sanposcape",
    android: {
      ...config.android,
      ...(androidKey ? { config: { googleMaps: { apiKey: androidKey } } } : {}),
    },
  };
};

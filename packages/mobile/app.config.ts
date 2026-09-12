import type { ConfigContext, ExpoConfig } from "expo/config";
import type { AndroidConfig } from "expo/config-plugins";
import { withAndroidManifest, withAppBuildGradle, withGradleProperties } from "expo/config-plugins";

/**
 * app.json を拡張し、Google Maps の SDK キーを環境変数から注入する。
 * キーはリポジトリにコミットしない（ADR-001: mobile 用 SDK key と backend の server key は分離する）。
 * - Android: Maps SDK for Android のキーが無いと地図が灰色のまま描画されない。
 * - iOS: 既定の Apple Maps を使うためキー不要（PROVIDER_GOOGLE を使う場合のみ必要）。
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const androidKey = process.env.GOOGLE_MAPS_ANDROID_SDK_KEY;
  return withCleartextTrafficForHttpBackend(
    withDisableAndroidLintVital(
      withAndroidGradleProperties({
        ...config,
        name: config.name ?? "sanposcape",
        slug: config.slug ?? "sanposcape",
        android: {
          ...config.android,
          ...(androidKey ? { config: { googleMaps: { apiKey: androidKey } } } : {}),
        },
      }),
    ),
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

/**
 * prebuild が生成する android/gradle.properties を CI 向けに上書きする。
 *
 * テンプレート（expo-template-bare-minimum）の既定値は
 * `org.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=512m` で、ネイティブモジュールの多い
 * 本プロジェクトの release ビルドではデーモンのヒープが枯渇する。実際 2026-09-11 の
 * mobile-e2e（run 34657232761）は dex マージ中（:app:mergeExtDexRelease）に
 * `OutOfMemoryError: Java heap space` を4スレッドで同時に起こして停止し、40分でタイムアウトした
 * （ログ上 FAILED と出る :app:mergeReleaseArtProfile は同時に走っていて巻き添えになっただけで、
 * 原因ではない）。ADR-004 の SS-44 追補が対処した lintVitalAnalyzeRelease の Metaspace OOM とは
 * 別種であり、既存の withDisableAndroidLintVital では防げない。詳細は ADR-004 の SS-85 追補。
 *
 * ランナー（GitHub Actions ubuntu-latest / EAS の Android ワーカーとも 4 vCPU・16GB）に対して
 * 2GB は明らかに過小なので、全プロファイル共通で引き上げる。E2E だけでなく staging-apk 等の
 * クラウドビルドも同じテンプレート既定値・同じ ABI 構成なので、同じ枯渇の対象になる。
 */
function withAndroidGradleProperties(config: ExpoConfig): ExpoConfig {
  return withGradleProperties(config, (config) => {
    setGradleProperty(
      config.modResults,
      "org.gradle.jvmargs",
      "-Xmx6144m -XX:MaxMetaspaceSize=1024m",
    );

    // ビルドする ABI を絞る。テンプレートの既定は armeabi-v7a,arm64-v8a,x86,x86_64 の4種で、
    // 上記 run の実測では CMake ビルドだけで 15.1 分（x86_64 4.6 / x86 4.3 / armeabi-v7a 4.1 /
    // arm64-v8a 2.1）を占め、ビルド30分の半分がここだった。E2E のエミュレータは
    // mobile-e2e.yml で arch: x86_64 固定なので、残り3種は成果物としても無駄であり、
    // mergeReleaseNativeLibs / mergeExtDexRelease（＝OOM 地点）のメモリ圧も4倍に膨らませていた。
    //
    // ただし絞ってよいのは E2E 専用の preview プロファイルだけで、実機に配る staging 系や
    // production で絞ると端末にインストールできなくなる。そのため既定では何もせず、
    // ワークフローが REACT_NATIVE_ARCHITECTURES を明示的に渡したときだけ上書きする
    // （GOOGLE_MAPS_ANDROID_SDK_KEY と同じく「CI が明示的に渡す」方式）。
    //
    // 注意: この値は @expo/fingerprint のハッシュには現れない（config plugin による
    // gradle.properties の書き換えは prebuild 時にしか具体化しないため）。
    // mobile-e2e.yml 側で APK キャッシュキーにこの値を直接連結して、値を変えたときに
    // 古い APK が使い回されないようにしてある。ワークフローを編集するときは必ず両方を見ること。
    const architectures = process.env.REACT_NATIVE_ARCHITECTURES;
    if (architectures) {
      setGradleProperty(config.modResults, "reactNativeArchitectures", architectures);
    }

    return config;
  });
}

/**
 * gradle.properties の既存キーを書き換える（無ければ追加する）。
 * テンプレート側の行を残したまま追記すると、後勝ちに見えて実際は Gradle の解釈依存になるため、
 * 必ず既存の行そのものを置き換える。
 */
function setGradleProperty(
  properties: AndroidConfig.Properties.PropertiesItem[],
  key: string,
  value: string,
): void {
  const existing = properties.find(
    (item): item is Extract<AndroidConfig.Properties.PropertiesItem, { type: "property" }> =>
      item.type === "property" && item.key === key,
  );
  if (existing) {
    existing.value = value;
    return;
  }
  properties.push({ type: "property", key, value });
}

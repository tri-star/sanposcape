/**
 * 地図を描く SDK（renderer）の判定（SS-267）。純粋関数だけを置く（`react-native` / `expo-*` を値 import しない。Vitest 対象）。
 * 実行時の値を読んで渡す入口は `src/config/mapProvider.ts`。
 *
 * - Android は常に Google Maps（Maps SDK for Android）。
 * - iOS は、`GOOGLE_MAPS_IOS_SDK_KEY` を入れてビルドしたとき（`app.config.ts` が `extra.iosGoogleMaps=true` を書く）だけ Google Maps。
 *   入れていないビルドは Apple Maps（MapKit）のまま。Google Maps SDK の pod が無いビルドで `provider="google"` を指定すると地図が出ない。
 *
 * Google Maps Platform の規約 3.2.3(e) は、Places の内容（ピンタブの検索結果など）を Google 以外の地図に出すことを禁じている。
 * Places の内容を出す画面は、`"google"` のときだけ出す（ADR-001 の SS-267 追補、ADR-M-007 の SS-267 追補）。
 */
export type MapRenderer = "google" | "apple";

export type MapRendererInput = {
  /** `Platform.OS`。 */
  platformOs: string;
  /** `Constants.expoConfig.extra.iosGoogleMaps`。`true` のときだけ有効（未知の値は Apple Maps に倒す）。 */
  iosGoogleMaps: unknown;
};

export function resolveMapRenderer({ platformOs, iosGoogleMaps }: MapRendererInput): MapRenderer {
  if (platformOs === "ios") {
    return iosGoogleMaps === true ? "google" : "apple";
  }
  return "google";
}

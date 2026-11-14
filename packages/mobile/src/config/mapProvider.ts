import Constants from "expo-constants";
import { Platform } from "react-native";
import { PROVIDER_GOOGLE } from "react-native-maps";

import { resolveMapRenderer, type MapRenderer } from "@/config/mapRenderer";

/** 起動中に変わらない値なので、モジュール評価時に1回だけ決める（判定の実体は `mapRenderer.ts`）。 */
const MAP_RENDERER: MapRenderer = resolveMapRenderer({
  platformOs: Platform.OS,
  iosGoogleMaps: Constants.expoConfig?.extra?.iosGoogleMaps,
});

/**
 * すべての `MapView` に渡す `provider`（SS-267）。Google Maps のときは `PROVIDER_GOOGLE`、Apple Maps のときは
 * `undefined`（react-native-maps の既定 = MapKit）。Android は既定でも Google だが、明示して揃える。
 *
 * ネイティブモジュール（expo-constants・react-native-maps）に依存するので Vitest の対象にしない。
 * テストされるモジュール（`lib/` や `api/` など）から import しないこと（components・app から使う）。
 */
export const MAP_PROVIDER: typeof PROVIDER_GOOGLE | undefined =
  MAP_RENDERER === "google" ? PROVIDER_GOOGLE : undefined;

/** 地図が Google Maps か。Places の内容（ピンタブの検索結果）を出してよいのはこれが `"google"` のときだけ。 */
export function currentMapRenderer(): MapRenderer {
  return MAP_RENDERER;
}

---
name: react-native-maps-notes
description: react-native-maps(1.29系)の実装メモ。MapViewはref+animateToRegion、Marker tracksViewChanges=falseと選択状態をkeyに含めた再マウント、nodeテスト用の自前MapRegion型、Mapsキー注入の確認方法
metadata:
  type: reference
  scope: durable
  adr: packages/mobile/adr/ADR-M-007-expo-config-and-maps-key-injection.md
---

`react-native-maps` は `package.json` で 1.29.8（2026-10 時点）。最初の実利用は SS-15 の
`features/walk/components/SpotMapView.tsx`。

- `provider` prop は指定しない（Android=Google Maps / iOS=Apple Maps。iOS のキーが不要になる）。
- `MapView` はクラスコンポーネント。`useRef<MapView>(null)` で ref を持ち、
  `mapRef.current?.animateToRegion(region, durationMs)` で再センタリングする。`initialRegion` は
  マウント時の1回しか読まれない（以後の変化は effect で `animateToRegion` する）。
  範囲へのフィットは `fitToCoordinates(coordinates, options)` / `fitToElements(options)`。
- `Marker` には `tracksViewChanges={false}` を必ず付ける（既定 true だと Android でマーカーごとに
  毎フレーム再描画され重い）。ただし false にすると**子 View（カスタムピン）の見た目の変化が
  ネイティブ側に反映されない**ため、選択状態などで見た目を変えるときは `key` にその状態を含めて
  Marker ごと再マウントする（`key={`${id}:${selected}`}`）。
- `Region` 型は、vitest（node 環境）でテストしたいロジックのために構造的互換の自前型（`MapRegion`）を
  `lib/` に定義する。`react-native-maps` からは `import type` もしない（node テストの純度を保つ）。

## Android Maps SDK キーの注入

注入経路（`app.config.ts` が `GOOGLE_MAPS_ANDROID_SDK_KEY` を `android.config.googleMaps.apiKey` に入れる、
`EXPO_PUBLIC_` を付けない、EAS では `.env` が載らない）は
`packages/mobile/adr/ADR-M-007-expo-config-and-maps-key-injection.md` が正本。
ローカルでは `.env` に書くだけで（シェル export 不要で）反映される。確認は
`pnpm --filter mobile exec expo config --type prebuild --json` の `android.config.googleMaps.apiKey`。

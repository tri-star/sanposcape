---
name: react-native-maps-notes
description: react-native-maps 1.27.2 の型・実装メモ（MapView ref, Marker tracksViewChanges, Maps キー注入）。SS-16 のルート描画（Polyline/fitToCoordinates）でも参照する
metadata:
  type: project
---

## 導入（SS-15, 2026-07-30）

`packages/mobile/src/features/walk/components/SpotMapView.tsx` が最初の実利用箇所
（`react-native-maps` は `package.json` には元々あったが import 0件だった）。

- `provider` prop は指定しない方針（Android=Google Maps / iOS=Apple Maps。iOS のキーが不要になる）。
- `MapView` はクラスコンポーネント。`useRef<MapView>(null)` で ref を持ち、
  `mapRef.current?.animateToRegion(region, durationMs)` で再センタリングする。
  `initialRegion` はマウント時の1回しか読まれない（以後の変化は effect 側で animateToRegion する）。
- `Marker` の `tracksViewChanges={false}`（既定 true）を必ず付ける。付けないと Android で
  マーカーごとに毎フレーム再描画され重くなる。ただし `false` にすると**子 View（カスタムピン）の
  見た目の変化がネイティブ側に反映されなくなる**ため、選択状態などを変えたい場合は
  `key` にその状態を含めて Marker ごと再マウントさせる（`key={`${id}:${selected}`}` のような形。
  react-native-maps の定番回避策）。
- `Region` 型（`{ latitude, longitude, latitudeDelta, longitudeDelta }`）は vitest（node環境、
  `react-native-maps` を import しない）でテストしたいロジックのために構造的互換の自前型
  （`MapRegion`）を `features/<feature>/lib/` に定義する。`import type` すら react-native-maps から
  しない（値 import はもちろん、型 import も node テストの純度を保つため避けた）。

## Android Maps SDK キーの注入経路

`app.config.ts` が `process.env.GOOGLE_MAPS_ANDROID_SDK_KEY`（`EXPO_PUBLIC_` 接頭辞ではない）を
読んで `android.config.googleMaps.apiKey` に注入する。**確認したところ `.env` に書くだけで
（シェル export 不要で）`expo config --type prebuild` に反映される**
（Expo CLI は config 評価時に `.env` の全変数を process.env にロードする。`EXPO_PUBLIC_` 制限は
「クライアントJSバンドルへの inline」の話であり、`app.config.ts` を評価する Node 側の
`process.env` には無関係）。反映確認: `pnpm --filter mobile exec expo config --type prebuild --json`
の `android.config.googleMaps.apiKey` を見る。

## SS-16 で使う想定（未実装・参考情報）

`/explore/routes/walking` のルート描画では `Polyline`（`path` 座標列）と
`fitToCoordinates`/`MapBounds` へのフィットが必要になる見込み（`docs/mobile-plan.md` SS-15 の
スコープ外セクション参照）。`MapView` インスタンスの `fitToCoordinates(coordinates, options)` /
`fitToElements(options)` が使える（`node_modules/react-native-maps/dist/src/MapView.d.ts` で型確認済み）。

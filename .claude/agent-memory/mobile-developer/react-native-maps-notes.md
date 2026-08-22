---
name: react-native-maps-notes
description: react-native-maps 1.27.2 の型・実装メモ（MapView ref, Marker tracksViewChanges, Maps キー注入）。SS-16 のルート描画（Polyline/fitToCoordinates）でも参照する
metadata:
  type: feedback
  scope: durable
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

## 複数区間のPolyline描き分けパターン（SS-33、実装済み）

周回ルート（往路+復路）を別経路として描き分ける実装で使ったパターン。同様に「1本のルートを
複数区間に分けて別スタイルで描く」要件があれば再利用できる。

- `RoutePolyline`（`src/components/ui/route-polyline/RoutePolyline.tsx`）に
  `color`/`dashPattern`/`strokeWidth`/`zIndex` を任意 props として追加し、既定値は元のまま維持
  （既存の呼び出し元は無改修で動く）。`lineDashPattern` prop が破線を作る
  （`[線分長, 間隔]` の px 配列）。
- 「1本で描くか複数本で描き分けるか」の分岐は、区間データを持つ feature 側の薄いコンポーネント
  （`WalkRouteLegPolylines.tsx`）に1箇所へ閉じる。**Fragment（`<>...</>`）を返す**こと
  （`View` で包むと `Polyline` は `MapView` の直下でなくなり描画されない。カスタムコンポーネントは
  RN ツリーで平坦化されるため Fragment なら問題ない）。
- 「今どちらの区間を進行中か」の判定（GPS ヒステリシス）はコンポーネントではなく `lib/` の純粋関数
  （`observeWalkLeg`）に置き、hook（`useWalkLegPhase`）は state 保持だけを担う薄い層にする
  （RN 依存の hooks/components は Vitest でテストできないため、判定ロジックだけ切り出してテストする）。
  ヒステリシス（切り替えマージン）と「一度到達したら戻さない」ラッチの2つを組み合わせると、
  GPS の揺れによる表示のちらつきを防げる。

---
name: maps
description: react-native-maps の実装メモ — MapView は ref と animateToRegion、Marker の tracksViewChanges と key の再マウント、onPress は Marker/POI で発火しない（onPoiClick）、自前の MapRegion 型、キー注入の確認方法、Polyline の zIndex は iOS（Apple Maps）で効かず更新のたびに最上位へ付け直される
metadata:
  type: feedback
  scope: durable
  verify_by: 2027-03-31
---

`react-native-maps` は 1.29.8（2026-10 時点）。キー注入の経路は ADR-M-007、Marker の基準点は ADR-M-019 と `pages-components-guideline.md`、
ScrollView 内の地図は ADR-M-012 の SS-149 追補、位置調整のオーバーレイと Modal の問題は ADR-M-011 D7 が正本。

## MapView

- `provider` は指定しない（Android = Google Maps / iOS = Apple Maps。iOS のキーが不要）。
- `MapView` はクラスコンポーネント。`useRef<MapView>(null)` で持ち、`animateToRegion(region, ms)` で動かす。`initialRegion` はマウント時の1回しか読まれない。
  範囲へのフィットは `fitToCoordinates` / `fitToElements`。
- **`MapView.onPress` は Marker と POI のタップでは発火しない。** POI は `onPoiClick`（Google のみ）。「タップした地点を選ぶ」UI は `onPoiClick` も同じハンドラにつなぐ。
  Android では Marker の真上のタップも MapView に伝わらない（#1132。ADR-M-011）。
- `showsUserLocation` は使わない（mock モードで OS の点と自前の点が2つ出る。`WalkRouteMapView` の JSDoc）。

## Marker

- `tracksViewChanges={false}` を付ける（既定 true だと Android でマーカーごとに毎フレーム再描画される）。
- false にすると子 View（カスタムピン）の見た目の変化がネイティブに反映されない。選択状態で見た目を変えるときは `key` に状態を含めて再マウントする（`key={`${id}:${selected}`}`）。

## Polyline の重なり順（iOS は zIndex が効かない）

- **`Polyline` の `zIndex` は Google Maps でしか効かない**（型の注釈 `@platform iOS: Google Maps only`）。`provider` を指定しないので iOS は Apple Maps になり、効かない。
- **Apple Maps の `Polyline` は、座標・色・太さが変わるたびに overlay を外して付け直す**（`ios/AirMaps/AIRMapPolyline.m` の `update` が `removeOverlay` → `addOverlay`）。
  付け直した線がいちばん上に来るので、位置が届くたびに座標が変わる線（散歩中の軌跡）は、毎回ほかの線より上に戻る。マウント順や再マウントで順序を作っても、次の更新で崩れる。
- **How to apply:** 線どうしの重なり順に頼る見た目（下に太く敷いて縁取りにする等）を iOS で成り立たせようとしない。動く線は上に来る前提でデザインする（SS-168 の軌跡は「ルート線の上に細く重ねる」にした。ADR-M-008 決定10）。
  `zIndex` を足すレビューでは iOS を見落としやすい（SS-168 は Copilot のレビューで発覚）。

## テストと型

- Vitest で使うロジックには構造的に互換な自前の `MapRegion` 型（`src/lib/mapRegion.ts`）を使い、`react-native-maps` からは `import type` もしない。
- ライブラリの型・実装は worktree に node_modules が無いことが多い。main のチェックアウトの node_modules か、GitHub の `docs/mapview.md` / `docs/marker.md` を見る（版の差は [[sandbox-and-tooling]]）。

## Android の Maps キー

ローカルは `.env` に書くだけで反映される。確認は `pnpm --filter mobile exec expo config --type prebuild --json` の
`android.config.googleMaps.apiKey`（`GOOGLE_MAPS_ANDROID_SDK_KEY=DUMMY` を付けて試せる）。

Related: [[ts-rn-pitfalls]], [[testing-and-e2e]]

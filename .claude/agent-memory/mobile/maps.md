---
name: maps
description: react-native-maps の実装メモ — Marker の rotation/flat は iOS で効かず向きは Polygon で描く、エミュレータで方位を与える adb emu sensor の手順、MapView は ref と animateToRegion、Marker の tracksViewChanges と key の再マウント、onPress は Marker/POI で発火しない（onPoiClick）、自前の MapRegion 型、キー注入の確認方法、Polyline の zIndex は iOS（Apple Maps）で効かず更新のたびに最上位へ付け直される、Android で画面を離れて戻ると座標が後から変わった線が古い座標に戻る（onMapReady の回数を key に入れる）、iOS は破線の線の太さと破線パターンを 2〜3 倍に拡大して描く（OS ごとの値にする）
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

## iOS（Apple Maps）は破線の線を太く描く（SS-232）

- `lineDashPattern` を付けた `Polyline` は、iOS で**太さと破線パターンの両方が拡大**されて描かれる（スクリーンショット1枚の実測で、太さ 5 の破線が約 12.5〜13.4pt・破線の周期が約 2.2 倍。同じ太さの実線は 5pt）。一様な拡大とは完全には合わず、仕組みは仮説の段階。
  react-native-maps は値をそのまま `MKPolylineRenderer` に渡しており、拡大は MapKit 側。Android（Google Maps）は起きない。
- Android は `lineCap="round"` のとき破線の長さを捨てて丸い点（直径 = 太さ）にし、間隔は端末の px で渡す。両 OS で同じ見た目にはならない。
- **How to apply:** 破線の線の見た目は OS ごとの値にする（`walkReturnLineStyle`。ADR-M-008 決定9 の SS-232 追補）。倍率 2.5 はスクリーンショット1枚から測った値の間を採ったもので、ズーム・画面の倍率・iOS の版での変化は未確認。
  iOS の見え方の報告は、スクリーンショットを画素で測ると原因の当たりが付けやすい（往路の実線を物差しにする）。

## 画面を離れて戻ると、座標が後から変わった線が古い座標に戻る（Android。SS-211）

- 画面を離れて戻る（タブ切り替え・スタックへの push）と、Android の `MapView` は線などを退避し、`onMapReady` の後に `addToMap(getPolylineOptions())` で作り直す。
  `MapPolyline` の `PolylineOptions` は**最初に地図へ足した時点で1回だけ作ってキャッシュ**され、後からの `setCoordinates` は反映されない（1.29.11・2.0.0-beta.15 でも同じ）。
  `MapPolygon` も同じ。`MapMarker` は毎回座標を詰め直すので影響しない。
- 症状: 座標が後から変わる線（散歩中の軌跡）が、戻った直後に描き始めの数点に戻る。次に座標の props が変わるまで直らない。JS の状態は消えていないので、`useWalkTracking` やバッファを疑って時間を溶かしやすい。
- **How to apply:** 後から座標が変わる線・図形を地図に足すときは、`onMapReady`（付き直すたびに呼ばれる）の回数を `key` に含めて作り直す（`WalkRouteMapView`。ADR-M-008 決定10 の SS-211 追補）。
  `SpotMapView` の周回ルート（目的地を変えると座標が変わる）は未対応。
- エミュレータで確かめるときは、歩行の流し込みを終えて**歩数・距離が止まってから**画面を行き来する。バックグラウンドの位置はまとめて遅れて届き、行き来の最中に点が足されると修正が無くても線が直って見える。
- `ui.sh screenshot` の画像はリポジトリの中（作業用の gitignore 対象のディレクトリ）に置かれ、Metro が拾って「Refreshing...」を出すことがある。Fast Refresh の反映は Metro のログに出ないので、修正の効果を確かめるときは `ui.sh reload` で読み込み直してから操作をやり直す。

## 向き・回転を地図に描く（SS-169）

- **`Marker` の `rotation` / `flat` は Google Maps でしか効かない**（型の注釈 `@platform iOS: Google Maps only`）。`provider` を指定しない iOS（Apple Maps）では回らない。
  地図に対する向きを両 OS で描くなら、`Polygon` などの図形で座標から描く（ADR-M-023）。
- 大きな `Marker` は Android で真上のタップ・長押しを `MapView` に渡さない（上の「MapView」節）。現在地のまわりに重ねる飾りは図形にすると地点選択を塞がない。
- 図形は距離（m）で描くので、画面上の大きさを保つには `latitudeDelta` と地図の高さ（`onLayout`）から換算し直す（`useHeadingBeamRadius`）。

## エミュレータで端末の向きを与える

`adb emu sensor set` で仮想センサーを書き換える（`adb` を先頭に置けば sandbox 内でも動くが、`ui.sh` と同じく外で実行するのが確実）。

- 既定の姿勢は**立てた状態**（`acceleration = 0:9.78:0.81`）。このままだと磁場の x・y だけでは方位が決まらないので、先に水平に置く: `adb emu sensor set acceleration 0:0:9.80665`
- 水平に置いた後、磁北からの角度 θ に向けるには、水平成分を B として `magnetic-field = -B·sinθ : B·cosθ : <下向き成分>`（例: 南 `0:-20:-40`、北東 `-14.14:14.14:-40`）。
- 既定の磁場は真北向き（x=0）。expo-location は前回の値から約 2° 変わるまで通知しないので、**北向きのまま購読を始めると何も届かない**（ADR-M-023）。確認では最初に向きを変える。
- 終わったら元に戻す: `acceleration 0:9.77631:0.812349`、`magnetic-field 0:9.88766:-47.7452`（エミュレータは他の worktree と共用）。

## テストと型

- Vitest で使うロジックには構造的に互換な自前の `MapRegion` 型（`src/lib/mapRegion.ts`）を使い、`react-native-maps` からは `import type` もしない。
- ライブラリの型・実装は worktree に node_modules が無いことが多い。main のチェックアウトの node_modules か、GitHub の `docs/mapview.md` / `docs/marker.md` を見る（版の差は [[sandbox-and-tooling]]）。

## Android の Maps キー

ローカルは `.env` に書くだけで反映される。確認は `pnpm --filter mobile exec expo config --type prebuild --json` の
`android.config.googleMaps.apiKey`（`GOOGLE_MAPS_ANDROID_SDK_KEY=DUMMY` を付けて試せる）。

Related: [[ts-rn-pitfalls]], [[testing-and-e2e]]

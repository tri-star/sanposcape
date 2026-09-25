---
name: rn-maps-marker-swallows-android-press
description: react-native-mapsのMarkerはAndroidでMapViewのonPressに伝播しない(#1132)。タップで動かすピンUIのdead zoneを疑う観点
metadata:
  type: project
  scope: task-local
  source_issue: SS-124
---

`react-native-maps`（node_modules/react-native-maps/src/MapMarker.tsx の `stopPropagation`/`tappable` の
JSDoc）によると、Android では Marker 上のタップが親 `MapView` の `onPress` に伝播しない
（"Android does not propagate `onPress` events"、既知 issue #1132）。`stopPropagation`/`tappable`
プロパティは共に Android では効果が無い（回避策が用意されていない）。

**Why**: SS-124 の `PinLocationAdjustOverlay`（[[ss124-pin-location-picking-and-adjustment]]）で、
「タップで既存ピンの位置を微調整する」機能の Marker（選択位置のピン）がまさにこの dead zone に
当たる可能性がある。タップで座標を動かす系の地図 UI は、既存マーカーの近くをタップする操作が
最も起きやすいのに、そこが一番反応しない場所になりうる。

**How to apply**: 地図に `Marker` を重ねた上でタップ/長押しによる座標選択をさせる実装（`onPress`/
`onLongPress` を `MapView` 側に付けている場合）を見たら、「Marker の真上をタップしたらどうなるか」
を必ず確認する。Android 実機確認の有無をレビューで問う。iOS は `stopPropagation`（既定 false）で
伝播するため問題になりにくいが、Android は常に問題になりうる。

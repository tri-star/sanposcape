---
name: maps-polyline-reattach-stale-coords
description: Android の react-native-maps は地図が付き直すと Polyline を「最初に足した時点の座標」で作り直す。座標が後から変わる線は onMapReady の回数を key に入れて作り直す。再現は tmp の画像を Metro が拾う点に注意
metadata:
  type: feedback
  scope: task-local
  source_issue: SS-211
---

`react-native-maps` 1.29.8 の Android 実装では、画面を離れて戻る（タブ切り替え・スタックへの push）と `MapView.onDetachedFromWindow` が線などを退避し、
`onAttachedToWindow` → `onMapReady` の後に `addToMap(getPolylineOptions())` で作り直す。`MapPolyline` の `PolylineOptions` は
**最初に地図へ足した時点で1回だけ作ってキャッシュ**され、後からの `setCoordinates` は反映されない。1.29.11・2.0.0-beta.15 でも同じ。
`MapPolygon` など他の図形も同じ作りの可能性がある（未確認）。

- 症状: 座標が後から変わる線（散歩中の軌跡）が、戻った直後に描き始めの数点に戻る。次に座標の props が変わるまで直らない。JS の状態は消えていない。
- 対処: `onMapReady`（付き直すたびに呼ばれる）の回数を state に持ち、その線の `key` に含める（`WalkRouteMapView`）。
  座標が描いた後に変わらない線（周回ルート・履歴の軌跡）は影響しない。

**Why:** JS の状態を疑って `useWalkTracking` の再マウントやバッファを追うと時間を溶かす。画面はアンマウントされておらず、ネイティブの線だけが古い。

**How to apply:**
- 地図に「後から座標が変わる線・図形」を足すときは、付き直しで古い座標に戻らないか確かめる。散歩開始画面（`SpotMapView`）の周回ルートも、目的地を変えた後に画面を離れて戻ると同じ理由で古いルートに戻りうる（SS-211 では未対応）。
- エミュレータで確かめるときは、歩行の流し込みを終えてから**歩数・距離が止まったのを見てから**画面を行き来する。バックグラウンドの位置はまとめて遅れて届くので、行き来の最中に点が足されると、修正が無くても線が直って見える。
- `ui.sh screenshot` は画像をリポジトリの `tmp/` に置き、Metro がそれを拾って「Refreshing...」を出すことがある。Fast Refresh で修正が反映されたかは Metro のログに出ないので、確かめるときは `ui.sh reload` で読み込み直してから操作をやり直す。

Related: [[maps]]

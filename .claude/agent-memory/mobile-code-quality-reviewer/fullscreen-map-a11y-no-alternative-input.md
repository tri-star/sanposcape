---
name: fullscreen-map-a11y-no-alternative-input
description: 地図タップ/長押しが唯一の入力手段になっている画面はスクリーンリーダーで完全に操作不能になりがち。SanpoMapSelectorとの対比で見つけた観点
metadata:
  type: project
  scope: task-local
  source_issue: SS-124
---

SS-124 の `PinMapFullScreen`（地点選択 `PinLocationPickerView` / 位置調整 `PinLocationAdjustOverlay`
の共通枠）は、地図を包む View に `accessible accessibilityLabel={title}` を付けて `MapView` と
`Marker` 群を1つの a11y ノードに畳んでいる。操作（タップ/長押しで座標を選ぶ）の代替手段が無いため、
スクリーンリーダー利用者はこの画面で位置を選べない。

**Why**: 同じ「地図で場所を選ぶ」機能でも、既存の `SanpoMapSelector.tsx` はカード選択肢に個別の
`accessibilityLabel` を付けて地図ジェスチャーに頼らない選択経路を用意している。今回の地図は
その対比が効く典型例だった。

**How to apply**: 地図・キャンバス系の操作（タップで選ぶ/ドラッグで動かす等）がその画面の
唯一の入力経路になっていないかを確認する。他に選択肢がある実装（カード・リスト・座標入力等）と
比較して、無ければ Should 級で指摘する（`accessibilityHint` での状況説明の追加、代替入力手段の
フォローアップ化などを提案する）。

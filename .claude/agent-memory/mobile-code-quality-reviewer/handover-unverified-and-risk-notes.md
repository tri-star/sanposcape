---
name: handover-unverified-and-risk-notes
description: プラン・引き継ぎメモの「未実施の手動確認」「既知の制約」「フォールバック案」を必ず読む。中核フローの実機検証が未了なら Warning、制約がコード/ADR に転記されていなければ Warning。react-native-maps の Marker 上タップの dead zone も含む
metadata:
  type: feedback
  scope: durable
---

実装プランや引き継ぎメモ（マージ後は PR 本文の「申し送り事項」）には、コードレビューでも
自動テストでも担保されない情報が書かれている。レビューでは次の2点を確認する。

## 1. 中核フローの実機検証が「未実施」なら Warning で報告する

SS-118（ピンの地図表示とタップで詳細へ遷移）では、引き継ぎメモの「未実施の手動確認」に、
ユーザーが最も気にする経路（マーカータップ → 詳細）がそのまま残っていた。
`.maestro/pin-map.yaml` も、Google Maps の Marker は testID で安定して触れないことを理由に、
この経路を E2E から外していた。

**Why:** 地図・カメラ・センサーなどネイティブ依存の強い UI は、型検査や単体テストでは
検出できない実機依存の挙動を持つ。「E2E にできない」は「レビューで見なくてよい」ではない。

**How to apply:** ネイティブ依存の UI が中核要件のチケットでは、「未実施の手動確認」
「後続への申し送り」「既知の限界」を必ず読む。中核フローの実機検証が未了なら、
実装の正しさとは別に Warning 級で報告する。Maestro フローや Plane の完了条件が
「ローカル実機検証は未実施」と自己申告している場合も同じ扱いにする。

## 2. プランの注意書きがコード/ADR に転記されているか確認する

プラン文書はチケット完了時に破棄される一時メモなので、「実機で確認すべきこと」
「既知のプラットフォーム制約とフォールバック案」がコードにも ADR にも転記されていなければ、
知見ごと失われる。例として SS-33 では「凡例の破線見本が Android で `borderStyle: 'dashed'` と
不均等な `borderWidth` の組み合わせで描画されない」という注意書きが、どこにも転記されていなかった。

**How to apply:** プランの「実機確認」「既知の制約」「フォールバック案」の記述に対応する実装ファイルの
コメントか ADR に、その制約が一言でも残っているか確認する。無ければ Warning として指摘する
（実装の正しさではなく、知見の保存場所の観点）。

## 地図 UI で特に疑う点: Marker 上のタップは Android で MapView に伝播しない

react-native-maps の `Marker` は、Android ではタップを親 `MapView` の `onPress` に伝播しない
（既知 issue #1132。`stopPropagation`/`tappable` のどちらでも回避できない）。
タップで座標を選ぶ・動かす UI では、既存マーカーの真上が反応しない dead zone になりうる。
SS-124 の位置調整画面で該当し、`packages/mobile/adr/ADR-M-011-pin-location-picking-and-adjustment.md`
に既知の制約として記録されている。

**How to apply:** `MapView` 側の `onPress`/`onLongPress` で座標を選ばせる実装を見たら、
「Marker の真上をタップするとどうなるか」と、Android 実機で確認したかを問う。

---
name: mobile-a11y
description: RN の a11y のレビュー観点 — 明示した accessibilityLabel が子テキストを上書き、pointerEvents="none" は a11y ツリーから消さない、分岐ごとの a11y の差、地図だけが入力手段の画面
metadata:
  type: feedback
  scope: durable
---

`pages-components-guideline.md` のルール6（a11y props を必ず設定）が正本。ここには、見た目では問題なくスクリーンリーダーで情報が欠ける・操作できない落とし穴を置く。

## 1. 明示した accessibilityLabel が子 Text の読み上げを上書きする

ラベルを明示すると子テキストの自動集約が消え、そのラベルだけが読まれる（`ScreenCatalog.tsx` の説明文、`WalkHistoryCard.tsx` の距離・時間が読まれない）。
安全な先例は `SpotCard.tsx`（明示せず子に任せる）。コンテナに label / `role="alert"` を付け、中に独立した Button（再試行）を入れる形（SS-19 `WalkSaveStatus.tsx`）は、子が操作対象から外れうる。

**How to apply:** リスト行や「エラー + アクション」系でラベルを見たら、補助情報（数値・時刻・説明）が入っているか確かめる。無ければ全部含めるか明示をやめる。
コンテナに role を付けて中にボタンを持つ形は、メッセージ行だけを alert で囲むよう求める。断定できなければ「要検証」の Warning。

## 2. pointerEvents="none" は a11y ツリーから消さない

行全体を Pressable にして中を `<View pointerEvents="none"><Checkbox/></View>` にする形（`CategorySheet.tsx`）では、中の role を持つ要素が残り二重に読まれうる。

**How to apply:** 中の要素に `accessibilityElementsHidden`（iOS）と `importantForAccessibility="no-hide-descendants"`（Android）があるか確かめる。中を見た目だけの box + icon で描く方が安全なことが多い。

## 3. 分岐ごとに a11y が割れる

kind / status で出し分けるコンポーネントでは、新しく書いた分岐だけ対応され、移植した古い分岐が取り残されやすい（SS-35 の `WalkRouteNotice.tsx`）。

**How to apply:** 全分岐の `accessibilityRole` / `accessibilityLabel` / `testID` を横並びで比べ、JSDoc の a11y 方針と一致しているかを見る。

## 4. 地図のタップ・長押しだけが入力手段の画面

`PinMapFullScreen`（SS-124）は地図を1つの a11y ノードに畳み、位置を選ぶ代替手段が無い（ADR-M-011 に既知の限界として記録）。`SanpoMapSelector.tsx` はカードという代替経路を持つ。

**How to apply:** 地図・キャンバスの操作が唯一の入力経路なら Should で指摘し、`accessibilityHint` での説明や代替入力のフォローアップ化を提案する。

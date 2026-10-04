---
name: rn-a11y-review-pitfalls
description: RN の a11y は見た目の UI と連動しない。accessibilityLabel による子テキストの上書き・pointerEvents="none" の二重読み上げ・分岐ごとの a11y 不整合・地図操作だけが入力手段の画面、の4観点
metadata:
  type: feedback
  scope: durable
---

`packages/mobile` のレビューで繰り返し見つかった a11y の落とし穴。共通点は「見た目では問題なく
見えるのに、スクリーンリーダーでは情報が欠けたり操作できなかったりする」こと。

## 1. 明示した accessibilityLabel が子 Text の読み上げを上書きする

RN では `accessibilityLabel` を明示すると、配下の子テキストの自動集約読み上げが上書きされ、
明示した文字列だけが読まれる。

- 実例: `ScreenCatalog.tsx`（SS-9）は `accessibilityLabel={link.label}` だけを渡し、隣の説明文が
  読まれない。`WalkHistoryCard.tsx`（SS-20）は「日付 目的地名 の散歩の詳細」だけをラベルにし、
  同じ行に表示している距離・所要時間が読まれない。
- 安全な先例: `SpotCard.tsx` はラベルを明示せず、子 Text の自動読み上げに任せている。
- より深刻な変種（SS-19 `WalkSaveStatus.tsx`）: コンテナ `View` に label/role="alert" を付け、
  その内側に**独立した操作可能な Button（再試行）**まで入れていた。この形だと、子のボタン自体が
  操作対象から外れるおそれがある。plain `View` はデフォルトで `accessible=false` なので、
  実際に子が隠れるかはプラットフォーム次第で断定しにくい。断定できなければ「要検証」の Warning にする。

**How to apply:** リスト行や「エラー＋アクション」系のコンポーネントで `accessibilityLabel` を
見たら、同じ行の補助情報（数値・時刻・説明文）がラベルに入っているかを確認する。入っていなければ、
全部を含めるか、明示をやめて子の読み上げに任せるよう提案する。コンテナに label/role を付け、
内部に独立した Button を持つ形は避け、メッセージ行だけを alert で囲むよう求める。

## 2. pointerEvents="none" は a11y ツリーから消さない

行全体を Pressable にし、内側に `<View pointerEvents="none"><Checkbox/></View>` を置く形
（例: `CategorySheet.tsx`）。`pointerEvents` はヒットテストだけを無効にするため、内側の
`accessibilityRole` を持つ primitive は a11y ツリーに残り、二重に読み上げられうる。

**How to apply:** 内側の要素に `accessibilityElementsHidden`（iOS）と
`importantForAccessibility="no-hide-descendants"`（Android）が付いているか確認する。
根本対応としては、内側を Pressable ではなく見た目だけの box+icon で描く方が安全なことが多い。

## 3. 複数分岐を持つ通知コンポーネントでは、分岐ごとに a11y が割れる

kind/status で出し分けるコンポーネントでは、新しく書いた分岐だけ a11y 対応され、
「そのまま移植」した古い分岐が取り残されやすい（SS-35 の `WalkRouteNotice.tsx` で発見。
SS-33 で単一分岐に縮小され、実例は解消済み）。

**How to apply:** 全分岐を横並びで比べ、`accessibilityRole`/`accessibilityLabel`/`testID` の
付け方に差が無いか確認する。JSDoc が主張する a11y 方針と各分岐の実装が一致しているかも見る。

## 4. 地図のタップ/長押しが唯一の入力手段だと、スクリーンリーダーで操作できない

`PinMapFullScreen`（SS-124）は地図全体を1つの a11y ノードに畳んでおり、位置を選ぶ代替手段が無い。
この制約は `packages/mobile/adr/ADR-M-011-pin-location-picking-and-adjustment.md` に既知の限界として
記録されている。対照的に `SanpoMapSelector.tsx` は、カード選択肢という地図ジェスチャーに頼らない
選択経路を持つ。

**How to apply:** 地図・キャンバス系の操作が画面の唯一の入力経路になっていないか確認する。
代替手段（カード・リスト・座標入力など）が無ければ Should 級で指摘し、`accessibilityHint` での
説明の追加や、代替入力のフォローアップ化を提案する。

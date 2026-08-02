---
name: accessibility-label-overrides-children-text
description: Pressable/View に明示的な accessibilityLabel を付けると、子要素の Text 内容が読み上げから排除される（説明文だけ消えるパターン）
metadata:
  type: project
---

`packages/mobile` の `Pressable` ベースのリスト行コンポーネントには2つの流儀が混在している。

- `SpotCard.tsx`: `accessibilityLabel` を明示しない → 子 `Text`（カテゴリ・名前・時間/距離）が
  自動的にすべて読み上げられる。
- `ScreenCatalog.tsx`（SS-9で新規追加、`src/features/design-system/components/ScreenCatalog.tsx`）:
  `accessibilityLabel={link.label}` を明示 → ラベルのみが読み上げられ、隣接する
  `link.description`（`Card` 内の2つ目の `Text`）はスクリーンリーダーから見えなくなる。

**Why:** RN では `accessibilityLabel` を明示すると、その要素配下の子テキストの自動集約読み上げは
上書きされ、明示した文字列だけが読み上げられる。「ラベルだけ明示すれば安全」という思い込みで
一部の情報だけ与えてしまい、結果的に無指定より情報量が減ることがある。

**How to apply:** リスト行コンポーネントで `accessibilityLabel` を明示している箇所を見たら、
その行の中に他にも意味のあるテキスト（説明文・補足情報）が並んでいないか確認する。あれば
`accessibilityLabel` にその内容も含める（テンプレートリテラルで連結するなど）か、
明示自体をやめて子テキストの自動読み上げに委ねる方が良いことが多い。
[[pressable-pointerevents-a11y-pitfall]] と同じ「RN の a11y は見た目のUIと連動しない」系の罠。

**追記（SS-19, 2026-08-02）:** より深刻な変種として、`WalkSaveStatus.tsx`（error 分岐）が
コンテナ `View` に `accessibilityLabel`/`accessibilityRole="alert"` を付け、その内側に
「メッセージ Text」だけでなく**独立した操作可能な `Button`（再試行）**まで含めていた。
テキストが隠れるだけでなく、**インタラクティブな子要素そのものがスクリーンリーダーの
操作対象から外れる**リスクがある（`ScreenCatalog`/`CategorySheet` の例は `Pressable`
自体に label を付けているだけで、内部に別の独立した Button を持たないため実害が出にくいが、
今回のケースは「コンテナ + 別の操作可能な子」という組み合わせで一段階リスクが高い）。
同じ「エラーメッセージ＋再試行ボタン」パターンの既存実装（`WalkActiveView.tsx` の
`routeNotice`、`LocationPermissionNotice.tsx`）はどちらもコンテナに
accessibilityLabel/Role を付けていない、という対照的な「安全な先例」が同一コードベースに
既にあった。**新しい「エラー+アクション」表示コンポーネントをレビューするときは、
コンテナに accessibilityLabel/Role を付けていないか、かつ内部に Button 等の独立した
操作要素が無いかを確認する。** RN の plain `View` はデフォルト `accessible=false` なので
実際に子を隠すかはプラットフォーム挙動次第で断定しにくい（Pressable/Touchable は
デフォルト `accessible=true` なので `ScreenCatalog`/`CategorySheet` の方が挙動を確信しやすい）。
断定できない場合は「要検証」として Warning 相当で指摘し、既存の安全な先例に揃えることを
提案するのが無難。

**追記（SS-20, 2026-08-02）:** `WalkHistoryCard.tsx`（`features/history`）がまた別の変種。
行全体の `Pressable` に `accessibilityLabel={`${item.dateLabel} ${item.destinationName} の散歩の詳細`}`
を明示しているが、同じ行内には `timeLabel` / `distanceKm` / `durationLabel` という**ラベルに含まれない
追加のテキスト**が並んでいる。晴眼者はカードを見ただけで距離・所要時間まで分かるのに、スクリーンリーダー
利用者は「日付 目的地名 の散歩の詳細」しか読み上げられず、詳細画面を開かないと距離・時間を知れない。
`SpotCard.tsx` は対照的に `accessibilityLabel` を明示せず子 `Text` の自動読み上げに委ねている
（このコードベースの「安全な先例」）。**リスト行コンポーネントで `accessibilityLabel` を書くときは、
同じ行に表示されている数値・時刻などの補助情報をラベル文字列にすべて含めるか、それが煩雑なら
明示自体をやめる**ことをレビューで確認する。

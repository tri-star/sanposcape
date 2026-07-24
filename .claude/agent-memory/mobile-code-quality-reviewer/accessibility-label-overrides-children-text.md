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

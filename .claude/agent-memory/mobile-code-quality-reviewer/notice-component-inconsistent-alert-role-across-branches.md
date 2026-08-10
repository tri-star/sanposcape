---
name: notice-component-inconsistent-alert-role-across-branches
description: 複数 kind を分岐する通知コンポーネントで、新しい分岐だけ accessibilityRole="alert" を付け古い分岐（そのまま移植した既存コード）には付いていない、という branch 間の不整合が起きやすい
metadata:
  type: project
---

SS-35 の `WalkRouteNotice.tsx`（`packages/mobile/src/features/walk/components/WalkRouteNotice.tsx`）は
`kind`（`"recalculating" | "recalc_failed" | "base_error" | "recalc_unavailable"`）で分岐する1コンポーネント。

- `recalc_failed`（新規ロジック）は `WalkSaveStatus.tsx` の新しい a11y パターンに倣い、
  メッセージ行だけを `<View accessibilityRole="alert" accessibilityLabel={message}>` で囲み、
  ボタンはその外に置いている（[[accessibility-label-overrides-children-text]] の追記で書いた
  「コンテナ+独立ボタン」問題を避ける形）。
- `base_error` は実装プランに「既存 `WalkActiveView` の `routeNotice` をそのまま移植」と明記されており、
  その既存コードは（[[accessibility-label-overrides-children-text]] にある通り）**そもそも
  accessibilityRole/Label を一切付けていなかった** ([[accessibility-label-overrides-children-text]] の
  「安全な先例」として記録済み）。移植の結果、`base_error` 分岐だけ role="alert" が無いまま
  新ファイルに持ち込まれた。

**Why:** コンポーネントの JSDoc は「`WalkSaveStatus.tsx` と同じ構造・同じ a11y 方針」と書いていたが、
実際は分岐ごとにポリシーが割れていた。プランの個別指示（そのまま移植）と、プランの一般指示
（エラー行に accessibilityRole="alert" を付ける）が矛盾していて、実装は個別指示を優先した結果。
新しい分岐と古い分岐が同じファイル内で隣り合うと、この手の不整合が目立ちやすい。

**How to apply:** 複数 kind／status を1コンポーネントで出し分ける通知系コンポーネントをレビューするときは、
「新しく書いた分岐」だけでなく **全分岐を横並びで比較**し、accessibilityRole/Label・testID の付け方に
差が無いか確認する。「そのまま移植」と指示されたコードでも、移植元が既に別の場所で確認済みの
a11y ギャップ（[[accessibility-label-overrides-children-text]]）を持っていないか、移植先の
JSDoc が主張する方針と食い違っていないかをチェックする。既存ギャップの単純な複製は「新規バグ」ではなく
「積み残し債務の伝播」だが、複数分岐が同一ファイルに同居した瞬間に一貫性の問題として指摘する価値が出る。

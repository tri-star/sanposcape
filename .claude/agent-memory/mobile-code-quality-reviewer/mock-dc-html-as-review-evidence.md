---
name: mock-dc-html-as-review-evidence
description: docs/mock/*.dc.html の元mockソースを grep すると、スタブ値の「一見不整合に見える数値」が意図的な移植かどうか判定できる
metadata:
  type: reference
---

`packages/mobile/docs/mock/ウォーキングコース検索アプリ.dc.html` は元デザインの動くモック
（バニラJS実装）で、`SPOTS` 配列や各画面の既定値ロジック（例: `selectedTimeMain: sel?sel.time:60`,
`goalName = sel ? sel.name : '川辺駅'`）がそのまま埋め込まれている。

**Why:** SS-9 レビューで `src/features/walk/data/defaults.ts` の `DEFAULT_WALK_GOAL`
（川辺駅・60分・4.0km）が、同じく `src/features/walk/data/spots.ts` の `SPOTS` 内 `s9`（川辺駅・
85分・5.4km）と数値が食い違って見えたため一瞬「新しいバグでは」と疑ったが、`.dc.html` を grep
（`selectedTimeMain|selectedKmMain|goalName`）したところ、mock 自体が「未選択時は名前だけ
'川辺駅' 固定・時間/距離は別途 60分/4.0km 固定」という仕様で、`SPOTS` の実データとは元々リンク
していないことが判明した。つまり実装は mock を忠実に移植しただけで、SS-9 で新たに持ち込まれた
不整合ではなかった。

**How to apply:** スタブ/デフォルト値が「別の場所の同名データと数値が食い違う」ように見えたら、
即座に指摘する前に `docs/mock/*.dc.html` を該当キーワードで grep し、元モックの仕様（意図的な
静的フォールバックか、リンクされているべき値か）を確認する。元モックの時点で同じ不整合がある
場合はこのタスクのスコープ外の既存仕様として扱い、誤検知を避ける。

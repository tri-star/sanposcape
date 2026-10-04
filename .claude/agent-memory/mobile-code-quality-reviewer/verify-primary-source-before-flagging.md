---
name: verify-primary-source-before-flagging
description: 不整合に見えたら、指摘する前に一次情報を読む。プランの「backend の型がまだ甘い」前提は Orval 生成物と router.py で、スタブ値やデフォルト値の食い違いは docs/mock/*.dc.html で確かめる
metadata:
  type: feedback
  scope: durable
---

プランや既存コードの記述をそのまま信じると、すでに解消した前提や、元デザイン由来の意図的な値を
「バグ」として誤って指摘してしまう。

## プランの型の前提を、生成物と backend で確かめる

SS-19 のプランは「`POST /walks` の 200 応答にスキーマが無いので Orval は `data: void` を生成する。
それまでは narrowing して使う」という前提で書かれていた。しかしレビュー時点では、
`packages/backend/src/sanposcape/walks/router.py` の `responses` に 200 の `WalkRead` があり、
生成物も `data: WalkRead` になっていた。実装者がプランより簡潔な実装を選んでいたのは正しかった。
一方で、`useFinishedWalkStore.ts` のコメントだけが古い前提のまま残っていた。

**How to apply:** プランが Orval 生成物（`src/api/generated/`。gitignore 対象なので
`pnpm --filter mobile orval` で生成される）や backend の `router.py`/`schemas.py` に触れていたら、
現物を `Read`/`Grep` して今の型を確認する。プランの条件付き記述（「〜までは〜する」）は、
条件が今も真か確かめる。型と実装が正しくても、JSDoc の陳腐化は別途チェックする。

## スタブ値・デフォルト値の食い違いは、元モックで確かめる

`packages/mobile/docs/mock/ウォーキングコース検索アプリ.dc.html` は元デザインの動くモック
（バニラ JS）で、各画面の既定値ロジックがそのまま埋め込まれている。たとえば
`src/features/walk/data/defaults.ts` の `DEFAULT_WALK_GOAL`（川辺駅・60分・4.0km）は、
モックの「未選択時は名前だけ川辺駅で、時間と距離は固定値」という仕様の移植だった（SS-9）。
別の場所の同名データと数値がずれていても、新規バグではなかった。

**How to apply:** スタブ値やデフォルト値が別データと食い違って見えたら、指摘する前に
`docs/mock/*.dc.html` を該当キーワードで grep する。元モックの時点で同じ食い違いがあれば、
既存仕様としてスコープ外に扱う。

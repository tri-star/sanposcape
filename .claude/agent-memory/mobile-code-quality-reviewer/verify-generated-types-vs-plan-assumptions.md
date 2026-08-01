---
name: verify-generated-types-vs-plan-assumptions
description: 実装プランの「backendの型がまだ甘い」前提はOrval再生成やbackend修正で覆っていることがある。生成物/backendのresponsesを直接読んでからプランの妥当性を判断する
metadata:
  type: project
---

SS-19（`packages/mobile/src/features/walk/api/walkApi.ts`）のレビューで発見。
実装プラン（`tmp/SS-19/mobile-plan.md` §5.3）は「`POST /walks` の 200（冪等再送）レスポンスに
`WalkRead` スキーマが無いため、Orval は `data: void` を生成する。依頼が通るまでは
`WalkRead | undefined` として narrowing してから使う」という前提で実装方針を書いていた。

しかし実際にレビュー時点のコードを読むと、`packages/backend/src/sanposcape/walks/router.py` は
既に `responses={..., 200: {"model": WalkRead, ...}}` を持ち、再生成された
`src/api/generated/endpoints/walks/walks.ts` の `createWalkWalksPostResponse200` も
`data: WalkRead`（`void` ではない）になっていた。実装者はこれに気づき、プランの
「narrowing して `WalkRead | null` を返す」という指示を採用せず、シンプルに
`Promise<WalkRead>` を返す実装に簡略化していた（正しい判断）。

**Why:** 実装プランは執筆時点のスナップショットであり、mobile 実装に着手するまでの間に
backend 側の軽微な改善依頼（プラン自身が「§5.3 依頼1」として起票していたもの）が先に
片付いていることがある。プランの文中に「〜まではこう実装する」という条件付き記述がある場合、
その条件（この場合は「backend の依頼が通っていない」）が今のコードでまだ真かどうかは
プランを読むだけでは分からない。

**How to apply:** Orval 生成物（`src/api/generated/`）や関連する backend の
`router.py`/`schemas.py` を参照するプランの記述に出会ったら、プランの文言を鵜呑みにせず
実際の生成物・backend コードを `Read`/`Grep` して現在の型を確認する。プランと実装が食い違って
見えても、それが「プランの想定が古くなっただけで実装の方が正しい」パターンであることがある
（今回がそう）。逆に、実装がプランの暫定コメント（JSDoc）だけ更新し忘れているケースもあるため
（`useFinishedWalkStore.ts` の `savedWalkId` コメントが「200 replay で本文が取れなければ null」
という、もう起こらない前提のまま残っていた）、型/実装は正しくてもコメントの陳腐化は
別途チェックする。[[mock-dc-html-as-review-evidence]] と同系統の「一次情報を読んでから判断する」
手法。

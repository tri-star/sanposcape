---
name: project_ss37_guest_walk_signin_merge
description: 保存失敗401時のサインインCTA・自動再送(SS-37)を触るPRのレビュー観点と、ADR-002を根拠にseverityを上げすぎた査読の教訓。指摘・対応・見送り案の正本はADR-M-008
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-M-008-active-walk-state-and-route-cache.md
---

正本: `packages/mobile/adr/ADR-M-008-active-walk-state-and-route-cache.md` 決定4 の
SS-37 追補・SS-37 ローカルレビュー追補。共有端末で「ゲストが保存に失敗して放置 → 別人が無関係な導線で
サインイン」すると、他人の軌跡が自分のアカウントに自動保存される問題（High）に対し、
`useFinishedWalkStore.signInForSaveRequested`（サマリの CTA を押した意思表示）を唯一のゲートにして解消した。
見送った「離脱時の明示的破棄導線」と残余リスクも同 ADR に記載がある（2026-10 時点で未実装）。

**How to apply:** `useAuthActions.ts` / `postSignInDestination.ts` / `walkSaveTrigger.ts` /
`useFinishedWalkStore.ts` に変更が入ったら最初に確認する:
1. `signInForSaveRequested` のゲートが外れていないか。特に「初回発火・別ドラフトへの切替は無条件」の
   例外が広がって、**同一ドラフトの認証状態変化による再発火**まで無条件になっていないか。
2. `getPostSignInDestination` の `dismissTo("/walk-summary")` 分岐が `wantsToSaveFinishedWalk`
   （意思表示込み）でだけ選ばれるか。
3. 未保存ドラフトの明示的破棄導線が実装されたか（されたらこの節を更新）。

**査読の教訓（オーケストレーターの訂正）:** 初版は「横断 ADR-002 決定6-1『ゲスト記録のマージ機能は
作らない』と食い違う」として severity の根拠にしたが過大評価だった。決定6-1 の「マージ」は
**サーバーに永続化済みのゲスト記録の所有権付け替え**を指し、「サインインを促す導線に倒す」はむしろ
CTA を指示している。ゲスト記録は永続化されないので該当しない。正味の指摘は共有端末のプライバシーだけ。
**ADR の文言を根拠に severity を上げるときは、その決定が何を対象にしているかを本文で確かめる。**

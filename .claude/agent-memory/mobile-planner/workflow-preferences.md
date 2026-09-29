---
name: workflow-preferences
description: task-workflow オーケストレーター経由でプランを作るときの進め方・成果物の置き場・承認の扱い
metadata:
  type: feedback
  scope: durable
---

プラン作成は task-workflow オーケストレーターから Issue ID・作業範囲・事前調査結果つきで依頼される。
成果物は `<project-root>/tmp/<ISSUE-ID>/mobile-plan.md`、判断の記録は同ディレクトリの `handover-notes.md`（追記式）。 <!-- tmp-ref-ok: プラン成果物の置き場を定める運用規約そのもの -->

**Why:** ユーザーは依頼後に離席していることが多く、承認待ちで止まるとワークフロー全体が止まる。

**How to apply:**
- ユーザー判断を仰ぎたい事項が出ても止めず、**推奨案を1つ選んで理由・トレードオフつきで確定**させ、`handover-notes.md` に「自律判断した事項」として残す。
- オーケストレーターの事前調査は前提として尊重しつつ、**必ず自分でコードを読んで裏を取る**。SS-37 では初回ブリーフの前提（ドラフトが消えるので CTA が無意味）が実際には成立せず、途中でオーケストレーター自身から訂正が入った。裏取りしていたので手戻りが小さかった。
- 実装フェーズを担う別エージェントが「追加質問なしで着手できる」粒度で書く（型・シグネチャ・testID・テストケース表まで）。
- 新しい API が要るチケットでも、PR を backend→mobile の2本に分けるか同一 PR にするかはオーケストレーター（task-workflow）の依頼に従う（既定の考え方は backend-planner 側メモリの「2本分割」。SS-136・SS-88 は同一 PR）。同一 PR と依頼された場合は「backend が main に入るまで待つ」とは書かず、「同じブランチで `packages/backend/openapi.yaml` が更新された後に `pnpm --filter mobile orval`」と書く（`orval.config.ts` の input は `../backend/openapi.yaml`、mobile CI も `openapi.yaml` の変更で起動する）。
- backend-planner が後から契約の穴を埋める（返すフィールドの絞り込み・タイブレーク等）ので、mobile の API 要求で「任意」とした項目は再確認で確定値に書き換わる前提で書く。

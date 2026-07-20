---
name: sanposcape_project
description: Plane上のSanposcapeプロジェクトの識別子・IDと立ち上げ計画（Module/WorkItem）の構成
metadata:
  type: project
---

Plane上のプロジェクト「Sanposcape」（散歩支援アプリ）の情報。

- project identifier: `SS`
- project_id: `691f5939-9065-4141-aa69-6b43b2750080`
- workspace_id: `2336fce3-9046-4d35-861c-88aee339d017`
- ワークスペース内に他にも「Sample(SAM)」「TaskFlow(TSKFL)」「Tasche(TCH)」「ChaseLight(CHASE、Planeデモ)」が存在するため、プロジェクト名だけで曖昧検索せず identifier や id で確定させること。

## 2026-07-19 立ち上げ計画登録

以下の5 Moduleと各4件、計20件のWorkItemを作成済み（`docs/milestones.md` を情報源とした計画）。

- M1: 開発基盤の整備 (module_id: 5b415687-70f1-44d3-9f17-dffa2d66363a)
- M2: デザイン取り込み・UI基盤 (module_id: d850d555-b5f3-41bb-99a9-15088e79885b)
- M3: 認証・アプリ骨格 (module_id: fcafdb25-b598-4883-8388-c0526949fbef)
- M4: 探索・散歩開始 (module_id: 6c344907-195f-45b2-bb9e-09b37e980eaa)
- M5: 散歩記録・履歴 (module_id: a59e23c2-590e-4ae9-81d0-d9f7bc6ae63d)

**Why:** MVPまでの開発ロードマップをPlaneのModule/WorkItemとして可視化し、AI・人間双方が進捗を追えるようにするため。
**How to apply:** 今後この計画に対するタスク追加・進捗更新・状態変更の依頼が来たら、上記のmodule_idを使って `list_module_work_items` 等で現状を確認してから操作する。「散歩ルート」はExpo Router等のroute概念とは別（歩いた道のり）である点に注意（ユーザーからの明示的注意事項）。

## states（project_id: 691f5939-9065-4141-aa69-6b43b2750080）

- Backlog: `fb407070-fc92-4f00-a159-f41b7197af6c` (group=backlog, default)
- Todo: `804c35b6-522f-4c76-b1b2-f38700cf9b3c` (group=unstarted)
- In Progress: `81c7939b-725c-4c0b-bb92-77b24ec48377` (group=started)
- Review: `65b14f74-6fd7-4129-9fab-60908f844572` (group=started)
- Done: `1e596b34-de54-46e1-a9c4-b61c21cc8ef0` (group=completed)
- Cancelled: `2abacd9b-3593-4423-a77f-d0eb64dde66a` (group=cancelled)

**Why:** 状態変更依頼のたびに `list_states` を呼ぶ手間を省くため。
**How to apply:** 「完了にして」「進行中にして」等の依頼が来たら、まず上記IDが現行と一致するか `list_states` で軽く確認し、変わっていなければ直接 `update_work_item(state=...)` に使う。2026-07-20時点でM1配下の全4件が初期状態Backlogだった点に注意（新規作成タスクはTodoではなくBacklogがデフォルト）。

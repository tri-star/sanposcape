---
name: task-workflow
description: "プロジェクト管理ツールに登録されたタスクを元にプランを作成->実装までの一連の流れを進める時に呼び出します。frontend/backendのタスクが混ざったタスクも遂行可能です。"
argument-hint: "[issue-id(option)] [instruction(option)]"
---

## パラメータについて

- `[issue-id]` : Issue ID (XXX-1などの形式であることが多い)
- `[instruction]` : 追加の指示や情報

## スキル中で利用するフォルダ

- `<project-root>` : プロジェクトのルートディレクトリ
- `<task-root>` : タスクに関するファイルを配置するディレクトリ。
  - タスクIDが与えられている場合: `<project-root>/tmp/<issue-id>`
  - タスクIDが与えられていない場合: `<project-root>/tmp/<YYYYmmdd-HHMM>`

## ワークフローの流れ

- 1. プロジェクト管理ツールのエージェントを利用し、Issue IDからタスクの本文を取得、タスクの内容を確認する
  - `[instruction]` にGitHubのPR番号が含まれていて、レビュー指摘に対応する指示内容の場合、
    `summarize-pr-comments` skill を呼び出してPRの指摘事項をまとめ、結果を `<task-root>/pr-review-summary.md` に保存する。(既に存在する場合は内容を消去して上書き)
    この場合、あわせて `task-status-sync` skill を `issue-id` `review-fix` で呼び出し、タスクを進行中の状態に更新する。
  - 後続のステップで作業に着手する時は、タスク内容として `<task-root>/pr-review-summary.md` のパスを参照して対応するように指示する。
- 2. タスクの内容を元に、frontend/mobile/backend/それ以外のどれに該当するかを判断する(複数に該当する可能性もある)
  - frontend(web) と mobile(React Native / Expo) はどちらもbackendのAPIを利用するクライアントとして扱う。プロジェクトの構成に応じて存在する方(両方存在する場合は両方)を対象とする。以降のステップでは、該当するクライアント側について `frontend-workflow` / `mobile-workflow` skill をそれぞれ呼び出す。
- 3. frontend/mobileのタスクの場合、該当する `frontend-workflow` / `mobile-workflow` skill を呼び出す。この時、必要なAPI情報を列挙してもらう(既存のAPIの何を使うか、どのAPIを新規作成・修正する必要があるか)
- 4. backendのタスクの場合、 `backend-workflow` skill を呼び出す。この時、frontend-workflow / mobile-workflowから受け取ったAPI情報(planファイルのパスでも可)を渡し、APIを設計するように依頼する)
  - backend-workflowの設計完了後、該当するクライアント側のworkflow(`frontend-workflow` / `mobile-workflow`)を再度呼び出して、API設計を再度確認、クライアント側のプランを必要に応じて修正する
- 5. ここまで一度、ユーザーにレビューを求める
- 6. ユーザーの承認後、該当するクライアント側の `frontend-workflow` / `mobile-workflow` skill を呼び出し、実装を開始する
- 7. `backend-workflow` skillの完了後、該当するクライアント側の `frontend-workflow` / `mobile-workflow` skill を呼び出し、実装を開始する
- 8. backend/frontendのどちらにも属さない場合(インフラの構築や、CI/CDの設定)、 `Plan` agent を呼び出してプランを作成、ユーザーからの承認を得た後で汎用エージェントを使い作業を進める
- 9. タスクが完了した場合は、testが通ることを確認、コミットも完了していることを確認し、git push、PRを作成する。
- 10. `task-status-sync` skill を `issue-id` `pr-created` `<作成したPRのURL>` で呼び出し、タスクの状態更新とPR URLの紐付けを行う。

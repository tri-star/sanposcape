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

## プラン作成後の進め方について

- プラン作成後は、ユーザーの指示を待たず、推奨のプランのまま実装まで自動的に進める。
- ただしユーザーから「プラン作成まで進めて」「プランだけ確認したい」のように、明示的にプラン作成までで停止する指示があった場合は、プラン作成が完了した時点でワークフローを終了する。

## 申し送り事項・ユーザー判断が必要だった事項の扱い

- プラン作成・実装のいずれかのフェーズで、ユーザーの判断を要する事項(仕様解釈やトレードオフの選択など)が発生した場合や、後続作業への申し送り事項がある場合は、判断内容とその理由を含めて `<task-root>/handover-notes.md` に追記する(自律的に判断して進めた場合も、その判断内容を記録する)。
- `backend-workflow` / `frontend-workflow` / `mobile-workflow` を呼び出す際も、各ワークフロー内で発生した同様の事項を同じファイルに追記するよう申し送る。
- PR作成時(手順9)には、このファイルの内容を整理し、PR本文の末尾に「## 申し送り事項」として含める。ファイルが存在しない場合はこのセクションを省略する。

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
- 5. ここまでのプラン内容をユーザーに提示する。ユーザーから明示的にプラン作成までで停止する指示があった場合はここでワークフローを終了する。それ以外の場合は、ユーザーの承認を待たず、推奨プランのまま次のステップに自動的に進む。
- 6. 該当するクライアント側の `frontend-workflow` / `mobile-workflow` skill を呼び出し、実装を開始する
- 7. `backend-workflow` skillの完了後、該当するクライアント側の `frontend-workflow` / `mobile-workflow` skill を呼び出し、実装を開始する
- 8. backend/frontendのどちらにも属さない場合(インフラの構築や、CI/CDの設定)、 `Plan` agent を呼び出してプランを作成する。ユーザーから明示的にプラン作成までで停止する指示がない限り、承認を待たずに汎用エージェントを使い作業を進める
- 9. タスクが完了した場合は、testが通ることを確認、コミットも完了していることを確認し、git push、PRを作成する。この際、`<task-root>/handover-notes.md` が存在する場合は内容を整理し、PR本文の末尾に「## 申し送り事項」セクションとして含める。
  - PRレビュー指摘への対応(手順1で `review-fix` と判断した場合)では、新たなPRは作成せず既存のPRのブランチへ push する。
- 10. `task-status-sync` skill を `issue-id` `pr-created` `<作成したPRのURL>` で呼び出し、タスクの状態更新とPR URLの紐付けを行う。
  - `review-fix` の場合も、対応を push した後に同様に呼び出してレビュー待ちの状態へ戻す。
- 11. `knowledge-harvest` skill を `issue-id`(タスクIDが無い場合は `<task-root>` のディレクトリ名)と「自動モード(task-workflow から呼び出し、PRあり)」である旨を伝えて呼び出す。このチケットで生まれた決定事項のADRへの転記・agent-memory の仕分け・ベースライン更新をコミットしてPRへ push し、`<task-root>` と `tmp/<PR番号>-comments.md` を削除するところまで、ユーザーの承認を待たずに完了させる。
  - 手順9で `<task-root>/handover-notes.md` をPR本文に反映した後に行うこと(収穫の後では tmp が削除されて参照できない)。
  - 手順10の後に行うのは、PR作成・状態更新の過程で専門エージェントが追記した agent-memory も仕分けの対象に含めるため。
- 12. 手順11の収穫結果(追補したADR、昇格・削除・統合したメモリの内訳、削除した tmp)を、`gh pr edit` でPR本文の末尾に「## 知識の収穫」セクションとして追記する(`review-fix` の場合は既存セクションに追記する)。収穫対象が何も無かった場合はこのセクションを省略する。
- 13. 最後の仕上げとして、未コミットのまま残ったエージェントの作業記録をコミットし、PRへ push する。
  - 対象は `.claude/memory-access-log/` 配下(メモリ本文を読むたびにフックが追記するアクセスログ)と、手順11以降に追加・変更された `.claude/agent-memory/` 配下のファイル。アクセスログはセッションごとの追記専用ファイルなので、今回のセッションに限らず配下の未コミットファイルをすべて含めてよい。
  - この手順より後にメモリ本文を読むと、そのアクセスログが再び未コミットで残る。この手順をワークフローの最後の操作とし、以降はメモリを読まない(最終報告は手元の情報だけで行う)。
  - コミット後、`git status --porcelain -- .claude/agent-memory .claude/memory-access-log` の出力が空であり、`<task-root>` が存在しないことを確認してワークフローを終了する(`tmp/` は `.gitignore` 対象のため `git status` には現れない)。
- 手順11〜13は、手順5でプラン作成までで停止した場合には行わない(`<task-root>` のプランは後続の実装で使うため削除しない)。

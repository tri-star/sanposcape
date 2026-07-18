---
name: backend-workflow
description: "backendに関するタスクのplan作成、開発タスクを実行する際に呼び出すスキル。このスキルを利用することでbackendのplan作成、開発(実装、テストコード記述)、テスト、動作確認までを一手で進めることが出来ます。このワークフローは入力として、「プロジェクト管理ツールのPlaneの課題ID」と、今回のタスクで「plan作成だけ行うのか、plan作成->実装まで行うのか」を受け取って動作します。"
argument-hint: "[plane-issue-id] [今回の作業範囲: plan|implementation|plan+implementation]"
---

## 概要

このスキルは、backendに関するタスクのplan作成、実装を進めるためのワークフローを定義します。

## ワークフロー中で使用するフォルダ

- `<task-root>` : `<project-root>/tmp/<plane-issue-id>`

## ワークフローの流れ

- 1. `plane-project-manager` エージェントを利用し、 plane-issue-id からタスクの内容を取得します。
- 2. 今回の作業範囲が"plan"の場合は、次の作業を行います。
  - 2-1. `backend-plan` エージェントを起動させ、プランを作成します。プランの作成結果は、 `<task-root>/backend-plan.md` に保存されています。
  - 2-2. この時点でユーザーにプランの確認を求め、必要に応じ修正を行います。
  - 2-3. ユーザーからのOKが出たら次の作業に進みます。
- 3. 今回の作業範囲が"implementation"の場合は、次の作業を行います。
  - 3-0. `task-status-sync` skill を `plane-issue-id` `start` で呼び出し、タスクを進行中の状態に更新します。
  - 3-1. `<task-root>/backend-plan.md` の内容を元に、 `backend-developer` エージェントを起動させ、実装タスクを実行します。
  - 3-2. `backend-developer` が正常にタスクを完了できなかった場合、起きている問題をユーザーに伝えます。
  - 3-3. `doc-maintainer` エージェントを起動させ、既存ドキュメントとの乖離を確認します。
  - 3-4. `backend-developer` がタスクを正常に完了した場合、以下のエージェントを並列で起動しレビューを行い、レビュー結果を `<task-root>/local-review.md` に保存、ユーザーに対し対応の要否を求めます。
    - `backend-security-reviewer`
    - `backend-architecture-reviewer`
    - `backend-code-quality-reviewer`
  - 3-5. 修正を行う場合、 `<task-root>/local-review.md` とユーザーの指示に従って `backend-developer` エージェントを起動させ修正を行います。エージェントが正常に完了した場合、ワークフローは終了です。

- 4. 今回の作業範囲が"plan+implementation"の場合は、上記 2と3を順番に実行します。

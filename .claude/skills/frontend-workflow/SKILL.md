---
name: frontend-workflow
description: "frontendに関するタスクのplan作成、開発タスクを実行する際に呼び出すスキル。このスキルを利用することでfrontendのplan作成、開発(実装、テストコード記述)、テスト、動作確認までを一手で進めることが出来ます。このワークフローは入力として、「プロジェクト管理ツールのPlaneの課題ID」と、今回のタスクで「plan作成だけ行うのか、plan作成->実装まで行うのか」を受け取って動作します。"
argument-hint: "[plane-issue-id] [今回の作業範囲: plan|implementation|plan+implementation]"
---

## 概要

このスキルは、frontendに関するタスクのplan作成、実装を進めるためのワークフローを定義します。

## ワークフロー中で使用するフォルダ

- `<task-root>` : `<project-root>/tmp/<plane-issue-id>`

## プラン作成後の進め方について

- プラン作成後は、ユーザーの指示を待たず、推奨のプランのまま実装まで自動的に進める。
- ただしユーザーから「プラン作成まで進めて」「プランだけ確認したい」のように、明示的にプラン作成までで停止する指示があった場合(作業範囲として"plan"のみが明示された場合を含む)は、プラン作成が完了した時点でワークフローを終了する。

## 申し送り事項・ユーザー判断が必要だった事項の扱い

- プラン作成中・実装中にユーザー判断を要する事項(仕様解釈やトレードオフの選択など)が発生した場合や、後続作業への申し送り事項がある場合は、判断内容とその理由を含めて `<task-root>/handover-notes.md` に追記する(自律的に判断して進めた場合も、その判断内容を記録する)。
- 本ワークフローの呼び出し元(`task-workflow`、または本ワークフロー自身)がPRを作成する際は、このファイルの内容を整理してPR本文の末尾に「## 申し送り事項」として含める。

## ワークフローの流れ

- 1. `plane-project-manager` エージェントを利用し、 plane-issue-id からタスクの内容を取得します。
- 2. 今回の作業範囲が"plan"の場合は、次の作業を行います。
  - 2-1. `frontend-plan` エージェントを起動させ、プランを作成します。プランの作成結果は、 `<task-root>/frontend-plan.md` に保存されています。
  - 2-2. 作成したプランの概要をユーザーに提示します。
  - 2-3. 作業範囲が"plan"のみの場合はここでワークフローを終了します。それ以外の場合(後続で実装まで行う場合)は、ユーザーの承認を待たずに推奨プランのまま次の作業に自動的に進みます。
- 3. 今回の作業範囲が"implementation"の場合は、次の作業を行います。
  - 3-0. `task-status-sync` skill を `plane-issue-id` `start` で呼び出し、タスクを進行中の状態に更新します。
  - 3-1. `<task-root>/frontend-plan.md` の内容を元に、 `frontend-developer` エージェントを起動させ、実装タスクを実行します。
  - 3-2. `frontend-developer` が正常にタスクを完了できなかった場合、起きている問題をユーザーに伝えます。
  - 3-3. `doc-maintainer` エージェントを起動させ、既存ドキュメントとの乖離を確認します。
  - 3-4. `frontend-developer` がタスクを正常に完了した場合、以下のエージェントを並列で起動しレビューを行い、レビュー結果を `<task-root>/frontend-local-review.md` に保存、ユーザーに対し対応の要否を求めます。
    - `frontend-security-reviewer`
    - `frontend-architecture-reviewer`
    - `frontend-code-quality-reviewer`
  - 3-5. 修正を行う場合、 `<task-root>/frontend-local-review.md` とユーザーの指示に従って `frontend-developer` エージェントを起動させ修正を行います。エージェントが正常に完了した場合、ワークフローは終了です。
- 4. 今回の作業範囲が"plan+implementation"の場合は、上記 2と3を順番に実行します。この場合、2-3のプラン提示後もユーザーの承認を待たず、自動的に3の実装作業に進みます。

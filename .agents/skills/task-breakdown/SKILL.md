---
name: task-breakdown
description: "Planeに登録されたWorkItemを機能単位のサブタスクに細分化する。ユーザーがタスクID（例: SAM-10）を指定して「細分化して」「タスクを分割して」「break down」と依頼した場合に使用する。plane-project-manager Agentを使ってタスク詳細の取得・サブタスク登録・元タスクのクローズまでを一貫して行う。"
---

# Task Breakdown（Planeタスク細分化）

plane-project-manager Agentを使い、指定されたWorkItemを機能単位のサブタスクに分割してPlaneに登録する。

## ワークフロー

### Step 1: タスク詳細を取得

plane-project-manager Agentで対象WorkItemの詳細を取得する。以下を確認:

- タスクのタイトル・説明
- 所属Module（あれば）
- 親タスク（あれば）
- 現在のステータス

### Step 2: コードベース調査・既存機能の確認

対象タスクが言及する機能について、プロジェクト内に既存の類似実装があるか調査する。

- 類似のCRUD実装、画面、バッチ処理が存在するか
- 横展開（既存パターンのコピー＆修正）で対応可能な範囲を特定
- 横展開可能な部分は粒度を粗く、新規実装が必要な部分は粒度を細かくする

### Step 3: タスクを細分化しPlaneに登録

細分化したサブタスクをplane-project-manager Agentで登録する。

**登録時の継承ルール:**
- 元タスクがModuleに属している → サブタスクも同じModuleに追加
- 元タスクに親タスクがある → サブタスクも同じ親タスクに紐付け

**登録後、ユーザーに細分化結果の一覧を提示して確認を求める。**

### Step 4: 元タスクをクローズ

ユーザーの確認後、元の「タスク細分化」WorkItemをDone状態に更新する。

## 細分化の粒度ガイドライン

詳細は [references/granularity.md](references/granularity.md) を参照。

要点:
- 最小単位は1機能（画面CRUD、バッチ処理1つ等）
- 既存パターンがない機能はC/R/U/Dを個別タスクに分割
- frontend/backendは分割せず1タスクにまとめる

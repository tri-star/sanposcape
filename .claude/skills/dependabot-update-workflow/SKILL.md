---
name: dependabot-update-workflow
description: "DependabotがオープンしたアップデートPRを解消、または内容を説明するためのワークフロー。PR番号と「resolve(解消)」「explain(説明)」のどちらを行うかを受け取って動作します。「DependabotのPRを解消して」「今回のアップデートについて説明して」のような依頼で使用します。"
argument-hint: "[PR番号] [action: resolve|explain]"
---

あなたは、Dependabot が作成した依存関係アップデート PR に対する対応（解消・説明）を管理するオーケストレーターです。あなたの役割は、対象 PR の内容と ecosystem を判定し、適切なサブエージェントへ調査・修正を依頼し、その結果をユーザーに提示・報告することです。

## スキルで利用するフォルダ・スクリプト

- `<project-root>` : `.git` ファイル/フォルダが存在するプロジェクトのルートディレクトリ
- `scripts/detect-ecosystem.sh` : PR のブランチ名・変更ファイルから ecosystem(frontend/backend/github-actions)を判定し JSON を出力する。

  ```bash
  bash .claude/skills/dependabot-update-workflow/scripts/detect-ecosystem.sh <PR番号>
  ```

- `scripts/post-or-update-pr-comment.sh` : マーカー文字列を使い、PR コメントを upsert（既存があれば更新、無ければ新規作成）する。

  ```bash
  bash .claude/skills/dependabot-update-workflow/scripts/post-or-update-pr-comment.sh <PR番号> "<!-- dependabot-update-explanation -->" <本文ファイルパス>
  ```

## 入力

このスキルは以下の2つの入力を受け取ります。

- PR番号
- action: `resolve`（PRを解消する）または `explain`（アップデート内容を説明する）

いずれかが不明な場合は、作業を始める前にユーザーに確認してください。

## 処理フロー

### 1. 対象PRの取得・確認

```bash
gh pr view <PR番号> --json title,headRefName,body,labels,author,files
```

取得した `author.login` が `dependabot[bot]` であることを確認してください。異なる場合は、Dependabot以外のPRに対してこのワークフローを実行しようとしている可能性が高いため、**処理を中断しユーザーに確認**してください。

### 2. ecosystemの判定

```bash
bash .claude/skills/dependabot-update-workflow/scripts/detect-ecosystem.sh <PR番号>
```

このスクリプトは、`headRefName`（`dependabot/<package-manager>/...` 形式）と変更ファイルパスから、以下のような JSON を出力します。

```json
{"ecosystem": "backend", "package_manager": "uv", "directory": "packages/backend"}
```

判定結果の `ecosystem` は `frontend` / `backend` / `github-actions` のいずれかです。以降の手順で、この判定結果をサブエージェントへのプロンプトに含めてください。

### 3. action = `explain` の場合

1. `dependabot-update-explainer` サブエージェントを Agent tool 経由で起動します。プロンプトには以下を含めてください。
   - PR番号、`headRefName`、ecosystem判定結果
   - 「更新されたパッケージ・変更前後バージョン・主な変更点・breaking changeの有無・このリポジトリで必要な追加作業の有無を調査して報告してほしい」という指示
2. サブエージェントから調査結果を受け取ったら、**そのままユーザーに提示し、PRへのコメント投稿について承認を得てください**。GitHubへのコメント投稿は外部公開アクションのため、無断で投稿してはいけません。
3. ユーザーの承認が得られたら、調査結果を一時ファイル（例: `tmp/<PR番号>-explanation.md`）に書き出し、以下のコマンドでPRコメントとしてupsertします。

   ```bash
   bash .claude/skills/dependabot-update-workflow/scripts/post-or-update-pr-comment.sh <PR番号> "<!-- dependabot-update-explanation -->" tmp/<PR番号>-explanation.md
   ```

### 4. action = `resolve` の場合

1. 対象PRのブランチをチェックアウトします。

   ```bash
   gh pr checkout <PR番号>
   ```

2. `dependabot-update-resolver` サブエージェントを Agent tool 経由で起動します。プロンプトには以下を含めてください。
   - PR番号、`headRefName`、ecosystem判定結果
   - 「メジャーバージョンアップ等で互換性が壊れていないか調査し、必要な修正・テスト・コミット・pushまで行ってほしい」という指示
   - 修正が不要と判断した場合は空コミットを作らず、判断内容を報告するだけでよいことを明記
3. サブエージェントの完了報告を受け取ったら、以下を確認します。
   - コード修正が行われたか、行われなかったか（判断理由）
   - コミットハッシュ・pushの結果
   - テスト実行結果
4. 対象PRに既存のレビュースレッド（人間やCIレビューによる指摘）が残っている場合は、`summarize-pr-comments` skill の利用をユーザーに促してください（このスキル自身はレビューコメントの解消は行いません）。

### 5. 最終報告

いずれのactionでも、最後にユーザーへ以下を報告してください。

- 対象PR番号・ecosystem判定結果
- (`explain`の場合) 投稿したコメントのURL
- (`resolve`の場合) 修正の有無、コミットハッシュ、pushの結果、テスト結果の概要
- 残課題・注意事項（あれば）

## エラーハンドリング

- PR番号またはactionが与えられていない場合は、ユーザーに確認します。
- `gh pr view` の結果、`author.login` が `dependabot[bot]` でない場合は処理を中断し、ユーザーに確認します。
- `detect-ecosystem.sh` がecosystemを判定できない場合は、判定できなかった理由（ブランチ名・変更ファイルの内容）を提示し、ユーザーに ecosystem を確認します。
- サブエージェントが繰り返し失敗を報告してきた場合は、内容をそのままユーザーに伝え、次のアクションを一緒に検討します。
- `post-or-update-pr-comment.sh` が失敗した場合は、エラー内容を説明し、`gh auth login` が必要かどうか等を確認します。

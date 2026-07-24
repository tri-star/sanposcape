# ローカル環境構築

## 概要

backendのローカル環境は Docker Compose を利用し、 api / db コンテナを作成する。

## フォルダ

- `<project-root>` : .gitフォルダがあるプロジェクトのルートと見なせるフォルダ
- `<backend-root>` : `<project-root>/packages/backend`

## 設計上の注意点

- ホスト側のポート番号は環境変数で上書きを可能にする
  - Git worktreeなどでローカル上に複数の環境を用意することを簡単にするため、 .envなどでポート番号を変更できる仕組みとする。
- Docker Compose のプロジェクト名は何もしないとローカル上の他の環境とバッティングを起こすため、これも
  .envの `DOCKER_COMPOSE_PROJECT_NAME` で上書き可能にする。
  - 命名はGitのブランチ名や、PlaneのIssue IDを利用する。
- .envファイルを簡単に作成出来るように、 テンプレートとして `.env.example` も作成する。
  - 別途作成するコマンドでポート番号、プロジェクト名を動的に置換できるように `DB_PORT={DB_PORT}` のような形式で記述しておく。
- compose.yaml, .env, .env-exampleは `<backend-root>` に配置する。

## ドキュメント作成

compose.yamlを新規作成したタイミングで、 `<backend-root>/docs/local-env.md` も作成し、ローカル環境構築手順をまとめる。

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
  .envの `COMPOSE_PROJECT_NAME` で上書き可能にする。
  - 命名はGitのブランチ名や、PlaneのIssue IDを利用する。
- .envファイルを簡単に作成出来るように、 テンプレートとして `.env.example` も作成する。
  - 別途作成するコマンドでポート番号、プロジェクト名を動的に置換できるように `DB_PORT={%DB_PORT%}` のような形式で記述しておく。
- compose.yaml, .env, .env.exampleは `<backend-root>` に配置する。

## 非root実行と所有権

- `api` は Dockerfile と Compose の両方で非rootの `app_user` として実行する。root への暗黙のフォールバックは許可しない。
- `APP_UID` / `APP_GID` を build args として使用し、既定値は `1000:1000` とする。0、非数値、既存 UID との衝突は build を失敗させる。Compose 経由の空文字は既定値へ置換し、Dockerfile に空文字を直接渡した場合は build を失敗させる。GID が既存の場合はそのグループを再利用する。
- WSL2/Linux の bind mount はホスト側の数値 UID/GID が優先されるため、ソースへ書き込む開発では `.env` または起動時の `APP_UID` / `APP_GID` でホストの `id -u` / `id -g` に合わせる。コンテナ内で bind mount 全体を `chown` しない。
- uv cache は `/home/app_user/.cache/uv` を使用し、BuildKit cache mount も同じ UID/GID で作成する。`.venv` は `venv-app-user` named volume に分離し、旧 `venv` volume を再利用しない。
- UID/GID を変更した場合は、仮想環境 volume の所有権も数値 ID のまま残るため、`venv-app-user` だけを再作成する。`db-data` を含むため `docker compose down -v` は使わない。
- Uvicorn のログは従来どおり stdout/stderr とし、`docker compose logs api` で確認する。ファイルログ用の書き込み先は追加しない。

## ドキュメント作成

compose.yamlを新規作成したタイミングで、 `<backend-root>/docs/local-env.md` も作成し、ローカル環境構築手順をまとめる。

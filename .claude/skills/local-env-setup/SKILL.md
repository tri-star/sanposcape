---
name: local-env-setup
description: "リポジトリの新規clone直後やgit worktreeで新しい環境を作成した直後に開発をスタートするための初期セットアップを実行するスキル。「開発環境をセットアップして」「cloneしたばかりなので初期化して」「dev setupして」などのリクエストで使用する。.envファイル生成、Dockerコンテナ起動、DBマイグレーション、seed投入、pnpm installを一括で行う。"
user-invokable: true
model: haiku
---

# 開発環境セットアップスキル

## 概要

リポジトリをcloneした直後、またはgit worktreeで新しい環境を作成した直後に、
frontend/backend両方の開発環境を一括でセットアップするスキルです。

## 前提条件

- Docker & Docker Composeがインストール・起動済みであること
- pnpmがインストール済みであること
- プロジェクトルート（`.git`フォルダ/ファイルが存在するディレクトリ）から実行すること

## セットアップ手順

### ステップ1: .envファイルの生成

プロジェクトルートの `scripts/initialize-dotenv.sh` を実行して、
frontend/backendそれぞれの `.env` ファイルを生成します。

```bash
bash scripts/initialize-dotenv.sh
```

このスクリプトは以下を自動で行います：
- 空きポートを自動検出
- `packages/backend/.env.example` → `packages/backend/.env` を生成
- `packages/frontend/.env.example` → `packages/frontend/.env` を生成

> **注意**: `.env.example` に `{%BACKEND_API_PORT%}` などのプレースホルダが含まれている
> ことが前提です。プレースホルダがない場合は、手動で `.env` ファイルを作成してください。


### packages/frontend, packages/backend 両方のセットアップ
それぞれのフォルダ内にある `README.md`、および `docs` フォルダ配下からローカル環境セットアップ手順を確認し実行します。
以下のような作業を済ませて開発をスタートする準備を終えることが目標です。

- 依存パッケージのインストール
- (backendの場合)docker composeの起動、DBの初期化、マイグレーション、seedingの実行


## 実行後の確認

初期化完了後、以下のコマンドで動作確認できます：

```bash
# backend の状態確認
cd packages/backend && docker compose ps

# ヘルスチェック (.env の API_CONTAINER_PORT を参照)
curl http://localhost:<API_CONTAINER_PORT>/health

# frontend の開発サーバー起動
pnpm --filter frontend dev
```

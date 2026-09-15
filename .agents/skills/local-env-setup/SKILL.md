---
name: local-env-setup
description: clone後やworktree作成後の開発環境を初期化する。アプリの.env不在を発見した場合にも使用する。
---

# ローカル環境のセットアップ

存在するpackageだけを対象に、各README・AGENTS.md・ローカル開発ガイドを確認する。既存の.envを上書きしない。

1. `scripts/initialize-dotenv.sh` の現行実装と各.env.exampleを確認し、`bash scripts/initialize-dotenv.sh` で必要な.envを生成する。テンプレートに未対応の形式があれば生成script側で扱い、手作業で.envを作らない。
2. packageの手順に従って依存をインストールし、backendのDocker起動・マイグレーション・必要なseedを行う。既存DBの初期化やvolume削除を通常のセットアップとして行わない。
3. backendのコンテナ・ヘルス、対象クライアントの必要な起動を確認する。現在の.envからポートを解決し、秘密値を出力しない。

mobileは [起動ガイド](../../../packages/mobile/docs/app-startup-guide.md)、backendは [開発ガイド](../../../packages/backend/docs/local-development.md) を参照する。frontendがなければfrontend向けコマンドを実行しない。OS・Docker・外部資格情報が不足する場合は完了した範囲と残りを報告する。

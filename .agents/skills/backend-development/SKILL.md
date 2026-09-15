---
name: backend-development
description: Python/FastAPIの計画・実装・検証を行う。API、DB、サービス、認証、マイグレーション変更が対象。
---

# Backend 開発

メインが担当する。[backend規約](../../../packages/backend/AGENTS.md) から対象の構成・命名・ツール・開発ガイドを読み、設計変更では [共通ADR](../../../docs/adr/) の該当決定も読む。

計画にはAPI入出力、認可/所有者境界、エラー、互換性、router/service/repositoryの責任、トランザクション、制約・索引・移行/復旧を必要に応じて含める。時刻・競合・再試行が関係すれば不変条件と検証方法を決める。既存ドメインの配置を確認し、規約本文を計画へ複製しない。

アプリ用alembic/ruff/pytestは [開発ガイド](../../../packages/backend/docs/local-development.md) に従いDockerコンテナ内で実行する。ホストのアプリ用venvを使わない。`.env` 不在なら [local-env-setup](../local-env-setup/SKILL.md)。

認可なら他ユーザー境界、移行なら既存データ、再試行なら重複実行など、受け入れ条件と壊れ得る挙動を検証する。内部実装の写しだけのテストを増やさない。API変更ではOpenAPIからクライアントを再生成し、生成物を手編集しない。

全体進行は [task-workflow](../task-workflow/SKILL.md)、実装後は [change-review](../change-review/SKILL.md)。

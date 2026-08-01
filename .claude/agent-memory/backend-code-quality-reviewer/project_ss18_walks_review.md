---
name: project_ss18_walks_review
description: SS-18（walksドメイン新設）のコード品質レビューで把握した全体像。今後 walks/ を触るPRのレビュー時の前提知識。
metadata:
  type: project
---

2026-08-01 時点、ブランチ `feat/ss-18-walk-record`（10コミット、main未マージ）で `walks/` ドメインを新設。`POST /walks`（記録保存・冪等）/ `GET /walks`（keysetページネーション履歴一覧）/ `GET /walks/{walk_id}`（軌跡付き詳細）。

**Why:** M5「散歩記録・履歴」の1件目。散歩終了時に1回だけ記録する設計（進行中散歩はサーバーに持たない）。軌跡は JSONB `[[lat,lng],...]`（6桁丸め）で保存し polyline エンコード依存を避ける。冪等キーは `client_walk_id`（mobile生成UUID）+ `UNIQUE(user_id, client_walk_id)`。認可は全クエリ `user_id` スコープ＋他人の散歩は404（403にしない、存在漏洩防止）。

主要ファイル:
- `walks/models.py` — `Walk`。`User` に `relationship()` を意図的に追加していない（CASCADE前提の削除が壊れるため）。
- `walks/repository.py` — 全メソッドが `user_id` 必須引数（IDOR対策の構造的担保）。`list_for_user` は `defer(Walk.track_points)` で一覧クエリから JSONB を除外、`limit+1` 方式。`create` は savepoint 冪等パターン（[[pattern_idempotent_savepoint]]）。
- `walks/schemas.py` — `WalkCreate.started_at/ended_at` は `AwareDatetime`。`model_validator(mode="after")` で `ended_at>started_at`・24h以内・`duration_seconds` の時計ずれ許容・未来日付排除を検証。
- `core/geo.py` — `GeoPoint` を `maps/schemas.py` から昇格（`maps/schemas.py` は再エクスポートのみ、OpenAPIコンポーネント名は不変）。
- `core/pagination.py` — keyset cursor の encode/decode（base64url、不透明トークン）。

レビューで見つけた主な指摘（詳細は各メモリ参照）:
- `GET /walks` の `started_after`/`started_before` が `AwareDatetime` ではなく素の `datetime`（[[pattern_aware_datetime_query_params]]）。
- `D1`〜`D11`/`Q1`〜`Q5` 等の決定コードがコメントに埋め込まれているが、由来の `tmp/SS-18/backend-plan.md` は gitignore 対象で追跡不能（[[antipattern_plan_decision_refs]]、`auth/mappers.py` の `B-3` と同系統の既存パターン）。
- track の境界値（0点・ちょうど10000点）の router レベルe2eテストが手薄（repository/mapper レベルでは空配列はカバー済み）。

テスト構成: `walks/tests/conftest.py` に軽量認証フィクスチャ（`AUTH_MODE=real` の `test_settings` 経由、Google JWKS fakeを使わない `/auth/session` を通さない形）。`users/tests/test_router.py` に `DELETE /users/me` → walks の CASCADE 回帰テストを追加済み。

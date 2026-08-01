---
name: project-ss18-walks-backend-complete
description: SS-18（backend: 散歩(Walk)モデル・記録保存・履歴取得API）はbackend側実装が完了済み。M5の次はmobile側SS-19/SS-20
metadata:
  type: project
---

SS-18「backend: 散歩(Walk)モデル・散歩ルート保存・履歴取得API（ユーザー紐付け・認可）」は
`feat/ss-18-walk-record` ブランチで backend 実装が完了した（2026-08-01）。10コミット
（`31de91e`〜`34559e0`）で `walks` ドメイン新設・マイグレーション・スキーマ・mapper・
cursor ページネーション・repository/service/router・テスト・OpenAPI 出力まで完了。
`docker compose exec api uv run pytest` は198 passed、`ruff check`/`format --check` も通過、
dev トークンでの手動疎通（保存→再送→一覧→詳細→他ユーザー404）も確認済み。PR はまだ作成していない。

**Why:** M5「散歩記録・履歴」の1件目。API は `POST /walks` / `GET /walks` / `GET /walks/{walk_id}`
で、認証必須・他人の散歩は404（IDOR対策）・`client_walk_id` による冪等保存
（新規201/再送200）・keyset(cursor)ページネーション。設計の詳細決定（D1〜D11）は
`tmp/SS-18/backend-plan.md` に集約されている。

**How to apply:**
- 今後 `walks` ドメインに触れる際は `packages/backend/src/sanposcape/walks/` 配下の
  router→service→repository の3層構造と、`walks/tests/conftest.py` の軽量な dev ユーザー
  フィクスチャ（`make_user` / `auth_headers` / `walks_client`）を踏襲する。
- 次のフロントエンド側タスクは SS-19/SS-20（mobile 側の記録保存・履歴表示）。backend の
  API契約（snake_case フィールド、`client_walk_id`は散歩開始時に採番、再送は200）はこの
  メモリと `tmp/SS-18/session-recap.md` を参照すれば分かる。
- 集計API・削除/編集API・PostGIS化は今回のスコープ外（Q1/Q2 で見送り確定）。将来必要になれば
  新規プランを立てる。

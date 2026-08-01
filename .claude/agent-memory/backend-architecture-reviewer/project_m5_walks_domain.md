---
name: project_m5_walks_domain
description: M5(散歩記録・履歴)マイルストーンにおける walks ドメインのスコープ決定と契約
metadata:
  type: project
---

M5「散歩記録・履歴」は SS-18（backend, walks ドメイン新設）→ SS-19/SS-20（mobile）の順で進む。SS-18 の PR は backend 単独で完結させ、mobile 側の orval 再生成は含まない。

SS-18 で明示的にスコープ外と決定された事項（2026-08-01 ユーザー確認済み、`tmp/SS-18/backend-plan.md` Q1-Q5）:
- `GET /walks/stats` 等の集計エンドポイントは作らない（期間フィルタ付き一覧をクライアント側で集計する方針）
- `DELETE /walks/{id}` は作らない（アカウント削除時の CASCADE のみ対応）
- 進行中の散歩をサーバーに永続化しない（mobile ローカル永続化で対応、SS-19）
- 散歩は終了時に1回の `POST /walks` で完了済みとして登録する。状態カラム（`status`）は持たない
- 軌跡は JSONB `[[lat, lng], ...]`（小数6桁丸め）で保存。polyline エンコードは不採用（mobile 側に新規依存を強いるため）

API契約（mobile SS-19/20 が依存）: フィールドは全て snake_case、`client_walk_id` は mobile が散歩開始時に採番する冪等キー、`duration_seconds` は一時停止を除いた実活動秒（`ended_at - started_at` とは別値）、`GET /walks` は `next_cursor` による keyset ページネーション、他人の散歩は 404（403 ではない）。

**Why:** これらは一度議論済みの意思決定であり、後続タスク（SS-19/20やM5の追加タスク）のレビューで「なぜ集計APIがないのか」「なぜ削除APIがないのか」を再度指摘しないようにするため。

**How to apply:** walks ドメイン関連のレビューでは、上記スコープ外事項の欠如を指摘事項にしない。逆に、この契約（snake_case、client_walk_id 冪等性、404方針）から逸脱する変更があれば指摘する。

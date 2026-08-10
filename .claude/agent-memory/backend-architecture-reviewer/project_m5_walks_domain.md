---
name: project_m5_walks_domain
description: M5(散歩記録・履歴)マイルストーンにおける walks ドメインのスコープ決定と契約
metadata:
  type: project
---

M5「散歩記録・履歴」は SS-18（backend, walks ドメイン新設）→ SS-19/SS-20（mobile）の順で進む。SS-18 の PR は backend 単独で完結させ、mobile 側の orval 再生成は含まない。

SS-18 で明示的にスコープ外と決定された事項（2026-08-01 ユーザー確認済み、`tmp/SS-18/backend-plan.md` Q1-Q5）:
- `DELETE /walks/{id}` は作らない（アカウント削除時の CASCADE のみ対応）
- 進行中の散歩をサーバーに永続化しない（mobile ローカル永続化で対応、SS-19）
- 散歩は終了時に1回の `POST /walks` で完了済みとして登録する。状態カラム（`status`）は持たない
- 軌跡は JSONB `[[lat, lng], ...]`（小数6桁丸め）で保存。polyline エンコードは不採用（mobile 側に新規依存を強いるため）

API契約（mobile SS-19/20 が依存）: フィールドは全て snake_case、`client_walk_id` は mobile が散歩開始時に採番する冪等キー、`duration_seconds` は一時停止を除いた実活動秒（`ended_at - started_at` とは別値）、`GET /walks` は `next_cursor` による keyset ページネーション、他人の散歩は 404（403 ではない）。

**Why:** これらは一度議論済みの意思決定であり、後続タスク（SS-19/20やM5の追加タスク）のレビューで「なぜ集計APIがないのか」「なぜ削除APIがないのか」を再度指摘しないようにするため。

**How to apply:** walks ドメイン関連のレビューでは、上記スコープ外事項の欠如を指摘事項にしない。逆に、この契約（snake_case、client_walk_id 冪等性、404方針）から逸脱する変更があれば指摘する。

### SS-42 追補（2026-08-09）: 集計API `GET /walks/stats` を新設（SS-18のスコープ外決定を覆した）

SS-18 では「集計エンドポイントは作らない（クライアント側で畳む）」としていたが、SS-42 でこの見立ては覆り、`GET /walks/stats` を新設した。理由は streak（連続日数）が「途切れるまで遡る」性質上 keyset ページングでクライアント側に畳めないため（ADR-003 決定10、SS-42 追補の「決定理由」節を参照）。**以後のレビューでは「SS-18で集計APIは作らない方針だったはず」という指摘はしないこと**（この memory 自体が古い決定を記録したものであり、SS-42 で正式に上書きされている）。

- レスポンスは `timezone` / `generated_at` / `today` / `streak_days` / `week` / `month` を1本にまとめる設計（理由: タブ切り替えでキャッシュが割れて日付跨ぎ時に値が食い違う事態を避けるため）。
- 集計境界は JST 固定。期間の WHERE 句は素の `timestamptz` 比較（`Walk.started_at >= / <`）のみを使い、`AT TIME ZONE` 変換は SELECT/GROUP BY にのみ登場させる設計（既存複合インデックス `ix_walks_user_id_started_at_id (user_id, started_at DESC, id DESC)` を効かせるため）。新規インデックス・マイグレーションは追加していない。
- 純粋ロジックは `walks/stats.py`（DB・Pydantic非依存）に切り出し、`repository.py`/`service.py`/`mappers.py` がそれぞれ import する一方向依存。
- `WalkService.__init__` に `now: Callable[[], datetime] = lambda: datetime.now(UTC)` を追加した。`auth/service.py` の `AuthService` と同じクロック注入パターンで、これが2例目の前例になった（→ [[backend-layering-conventions]]）。
- 詳細実装ファイル: `packages/backend/src/sanposcape/walks/{stats,service,repository,mappers,schemas,router}.py`。ADR: `docs/adr/ADR-003-walk-record-persistence-and-history-api.md` の決定10〜12（SS-42追補）。

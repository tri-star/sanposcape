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

### SS-53 追補（2026-08-12）: `DELETE /walks/{walk_id}` を新設（SS-18のスコープ外決定を覆した・2度目）

SS-18 では「削除APIは作らない（CASCADEのみ対応）」としていたが、SS-53 でこれも覆り、物理削除の `DELETE /walks/{walk_id}` を追加した（ADR-003 決定13）。**以後のレビューでは「SS-18で削除APIは作らない方針だったはず」という指摘はしないこと**。

- 物理削除（論理削除カラムなし）。理由: 一覧/詳細/日次集計/streak走査の4読み取り経路すべてに除外条件を配ると1箇所の漏れで集計が腐るリスクがあり、決定11（非正規化を避けた理由）と同種の判断。
- `WalkRepository.delete(*, user_id, walk_id) -> bool`。ORM `session.delete()` を使用（`sqlalchemy.delete()` の一括DELETEは identity map 不整合のリスクがあるため不採用）。`users/repository.py::delete()` と同じ「serviceがcommitを持つ・repositoryはbool/Noneで結果を返し例外を投げない」分担を踏襲。
- 2回目の削除は404（冪等にしない）。tombstoneを作らないトレードオフとしてADRに明記済み。削除後は `(user_id, client_walk_id)` のUNIQUEが解放され、同じ`client_walk_id`で再送すると再作成される（これも仕様として許容・テスト固定済み）。
- mobileの削除導線はSS-53のスコープ外（backend APIのみ）。
- 実装は `tmp/SS-53/backend-plan.md` に極めて詳細（設計理由・リスク表・テストID D-R1〜5/D-S1〜10/D-T1〜12）があり、実装はこのプラン通りに完了している（2026-08-12時点でレビュー済み）。
- 気づいた点（2026-08-13追記・解消済み）: `WalkRepository.delete()` は「SELECTで存在確認→`session.delete()`→`flush()`」というTOCTOUパターンで、`users/repository.py::delete()`と同型。当初「真に同時な2重DELETEでStaleDataError（未捕捉→500）になり得るのでは」と懸念していたが、SS-53追加コミット（b585bfa/36cec95）のレビュー時に`repository.py::delete()`のdocstringを読んだところ既に手当て済みと判明: `Walk`に`version_id_col`が無いため`confirm_deleted_rows`はSQLAlchemyの仕様上`StaleDataError`ではなく`SAWarning`にしかならず、実装は`flush()`呼び出し区間だけ`SAWarning`を例外に昇格させて`StaleDataError`と合わせて捕捉し`False`を返す設計になっている（→呼び出し元は通常の404扱いに揃う）。**以後、この「真の同時実行でのStaleDataError化」を未解決リスクとして再指摘しないこと**。`walks/service.py::delete_walk()`のdocstring（同コミットで更新）もこの2パターン（未検出/競合による0件失敗）を明記しており、実装とdocstringは整合している。

---
name: project_ss111_pin_read_api
description: ピン閲覧API（SS-111）で確立し、sanpo_maps/pins 配下の後続変更が踏襲すべきレビュー観点（JOINでの認可・バッチ取得・閲覧はcommitしない等）。決定の正本はADR-009決定14〜18。
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md
---

閲覧API（`GET /pins`・`GET /pins/{pin_id}`・`GET /pins/{pin_id}/photos`）の設計判断
（bbox を4つの独立パラメータにする、cover_photo、原本URL、ページング、ストレージ障害時は
503にせずURLをnull）は `docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md` の
決定14〜18（SS-111 追補）が正本。

**後続の変更が逸脱していないかを見る点**（パスは SS-137 統合後の `sanpo_maps/pins/`）:
- **認可は JOIN で絞った取得**: `sanpo_maps/pins/repository.py` の `get_for_member()`
  （ロックなし）と `get_for_member_for_update()`（`FOR UPDATE`）が `_member_pin_stmt()` を共有する。
  `user_id` 無しで引ける取得口を新設していたら指摘する。
- **一覧の N+1 回避**: ページ内 `pin_ids` に対して `list_tags_for_pins`/`get_cover_photos`/
  `count_photos_for_pins` を `IN (...)` でまとめて取る「本体1 + 付随情報N種類のバッチ取得」の形。
  ループ内クエリは指摘する。
- **keyset カーソルは型別ユーティリティ**: `core/pagination.py` の `(datetime, uuid)` 用と
  `(int, uuid)` 用（`encode_position_cursor`）。新しいキー型はこの並びに追加する。
- **閲覧系の service メソッドは commit しない**（書き込み系だけが commit 境界を持つ）。
- 認可チェック直後の `db.get()` は identity map で吸収されることが多い（[[feedback_sqlalchemy_identity_map_not_n_plus_1]]）。

**再指摘しないこと:** 「なぜ total_count や権限フィールドが無いのか」は SS-111 で意図的に
スコープ外とした（ADR-009 SS-111 追補「スコープ外にしたもの」・決定24）。

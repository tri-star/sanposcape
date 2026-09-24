---
name: project_ss111_pin_read_api
description: SS-111（ピンの閲覧API）レビュー結果と、SS-112/118/120が踏襲すべき確立パターン
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md
---

SS-111（`GET /pins`一覧・`GET /pins/{pin_id}`詳細・`GET /pins/{pin_id}/photos`全件）はレビュー済み・Critical/High指摘なし。実装計画の判断（bbox の4パラメータ化・keysetページング設計・原本URLの扱い等）が実装に一貫して反映されている（計画と実装の乖離なし）。設計判断の一次記録は ADR-009 追補（決定14〜18）。

確立された、後続チケットが踏襲すべきパターン:
- **認可はJOINで絞った取得**: `PinRepository.get_for_member()`（ロックなし版）と`get_for_member_for_update()`（`FOR UPDATE`版）が`_member_pin_stmt()`という共通private関数を共有。SS-112（権限マトリクス）はこの`get_for_member()`をそのまま使う設計で用意済み。
- **一覧のN+1回避パターン**: ページ内`pin_ids`に対し`list_tags_for_pins`/`get_cover_photos`/`count_photos_for_pins`を`pin_id IN (...)`でまとめて取得する「本体1 + 付随情報N種類をバッチ取得」の形。`get_cover_photos`は`DISTINCT ON`（PostgreSQL固有）を使用。
- **bboxクエリパラメータは4つの独立したfloatフィールド**（`min_latitude`/`min_longitude`/`max_latitude`/`max_longitude`）で、1つの文字列（`bbox=a,b,c,d`）にしない。理由: 座標順序の取り違え防止とOrvalでの型付け（範囲制約）のため。今後地図系の検索APIを作る場合はこの形を踏襲する。
- **keysetページングの型別ユーティリティ**: `core/pagination.py`に`(datetime, uuid)`用（`encode_cursor`/`decode_cursor`、walks由来）と`(int, uuid)`用（`encode_position_cursor`/`decode_position_cursor`、SS-111で追加）の2系統がある。新しいキー型が要る場合はこの並びに追加する。
- **閲覧系サービスメソッドはcommitしない**（`list_pins`/`get_pin`/`list_pin_photos`）。書き込み系のみservice層がcommit境界を持つ規約は維持されている。
- **ストレージ未構成・障害時は503にせずURLをnullで返す**（ADR-009 決定18）。閲覧系APIはDB由来の情報だけで200を返せる設計を維持する。

**Why:** SS-112（編集・削除・権限マトリクス）、SS-118（mobile地図表示）、SS-120（mobile検索タブ）が同じ`pins/`ドメインに手を入れる。上記パターンから逸脱する変更（例: repositoryにuser_id無しの取得口を作る、一覧でループ内クエリを書く、bboxを1文字列にする）があれば指摘する。

**How to apply:** SS-112以降のレビューでは、このメモの確立パターンからの逸脱を優先的に確認する。「なぜtotal_countや権限フィールドが無いのか」はSS-111で意図的にスコープ外とされた決定であり、再指摘しない（ADR-009 SS-111追補「検索条件（`q`・`tags`）について」に記録済み）。

---
name: project_ss111_pin_read_api_review
description: SS-111（GET /pins, /pins/{pin_id}, /pins/{pin_id}/photos）レビュー概要。設計は堅牢、Critical指摘なし。既知のギャップ（unconfigured storageテストの偏り、plan決定コード参照）。
metadata:
  type: project
  scope: task-local
  source_issue: SS-111
---

2026-09-24、ブランチ `tri-star/ss-111-pin-read-api`（`packages/backend` 配下、コミット
`224ba77`〜`a56fb16`）をレビュー。プランは「ピンの閲覧API（一覧・詳細・写真全件）」を
`sanpo_map_id` の bbox・キーワード・タグ絞り込み + keysetページングで実装するもの
（ADR-009 の BK-4）。

## 全体評価
IDOR対策（`user_id` 必須引数 + JOIN によるmember判定、service/repository二重防御）、
keysetページング（`(created_at,id)` と新設の `(position,id)`）、N+1回避（一覧の
tags/cover_photo/photo_countをpin_id IN (...)でまとめて取得）、ストレージ未構成時に
503ではなく200+null URLで返す設計など、いずれも正確に実装されていた。Critical/Highに
相当する指摘は見つからなかった。

## 見つかった指摘（Medium/Low相当。詳細はレビュー本文を参照）
- `pins/tests/test_router.py` の `unconfigured_storage_client` を使ったテストが
  `TestListPins`（1件）にしかなく、`TestGetPin`/`TestListPinPhotos` には無い。
  3エンドポイントとも200+null URLになることを確認する完了条件を router テストの
  粒度では満たしていない（`to_pin_photo_read` が共通なので実害リスクは低い）。
- decision code コメント（`SS-111 D4`〜`D11`, `backend-plan.md 5.x`）が
  `pins/schemas.py`/`repository.py`/`mappers.py`/`router.py`/`service.py` に多数追加された。
  ADR-009 に「追補（決定14〜18）」として committed な一次記録が用意されているにも
  関わらず、コード側は計画メモ側の decision code を指したまま
  ([[antipattern_plan_decision_refs]] 参照)。
- `get_cover_photos`/`count_photos_for_pins`/`list_tags_for_pins`（repository）は
  `list_photos_page` と違い「呼び出し元が認可済みpin_idsを渡すこと」という docstring の
  注記が無い（実害は無い。呼び出し元が常に `list_for_member` の結果由来のため）。
- `PinBoundingBox`（dataclass）のフィールド順が `PinListQuery` のパラメータ順
  （min_lat, min_lng, max_lat, max_lng）と異なる（min_lat, max_lat, min_lng, max_lng）。
  すべてキーワード引数で呼ばれているため実害なし、コスメティックな指摘。

## 良い実装として確認したもの
- `core/pagination.py::encode_position_cursor`/`decode_position_cursor` は往復・不正入力
  （非数値・負数・UUID不正・base64不正・区切り欠落・改ざん）を `core/tests/test_pagination.py`
  で網羅。
- `PinPhotoRead.original_url` はサムネイルと独立に `ObjectStorageUnavailableError` を捕捉
  （片方の障害がもう片方に波及しない）。
- `list_for_member` の `q` 検索は `_escape_like`（`\`→`\\`,`%`→`\%`,`_`→`\_`）で
  ILIKE のワイルドカード注入を防いでおり、`100%` が `1000` に誤爆しないことをテストで確認済み。

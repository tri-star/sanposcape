---
name: project-ss111-pins-read-api-complete
description: SS-111 backend（ピンの閲覧API: GET /pins・/pins/{id}・/pins/{id}/photos）は実装完了。次はmobile側SS-118/SS-120
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-009-sanpo-map-pin-data-model-and-photo-upload.md
---

SS-111（ADR-009 BK-4）の backend 実装は完了（2026-09-24）。`GET /pins`（bbox・q・tagsの絞り込み、
`created_at DESC` keysetページング）、`GET /pins/{pin_id}`（詳細）、`GET /pins/{pin_id}/photos`
（`(position, id)` keysetページングの全件取得）を追加した。全841テスト通過、`openapi.yaml` 再生成・
commit済み、ADR-009に決定14〜18として追補済み。

**Why:** BK-4はSS-88（[[project_ss88_pins_backend_complete]]、ピン登録・写真アップロード）の
「移行・対応事項」として持ち越されていた項目。SS-118（mobile地図表示）・SS-120（mobile検索タブ）が
この閲覧APIに依存するため先に実装した。

**How to apply:**
- `PinPhotoRead` に `original_url: str | null`（原本のpresigned GET）を追加した。サムネイルと
  独立に `ObjectStorageUnavailableError` を捕捉するため、`POST /pins` 等の既存応答にも
  `original_url` が現れる（後方互換のadditive変更）。mobile側の手書きテストデータ（msw等）で
  `PinPhotoRead` を使っている箇所は型エラーになりうる。
- 一覧の代表写真は `cover_photo: PinPhotoRead | null`（position最小）。`memo` は一覧に含めない
  （詳細のみ）。総件数（`total_count`）は返さない設計（必要ならSS-120でoptional field追加）。
- bboxは `min_latitude`/`min_longitude`/`max_latitude`/`max_longitude` の4つの独立クエリ
  パラメータ（1つの文字列にしなかった。順序の取り違えを防ぐため）。
- `core/pagination.py` に `encode_position_cursor`/`decode_position_cursor`（int版）を追加した。
  既存の `encode_cursor`/`decode_cursor`（datetime版）は改名していない。
- 閲覧APIはストレージ未構成・障害時も200を返しURLをnullにする（503にしない）。書き込み系API
  （`POST /pins` 等）の503とは意図的に区別している。
- `PinRepository.get_for_member()`（ロックなし版）はSS-112（編集・削除API・権限マトリクス）でも
  使う想定で用意した。

次はmobile側: SS-118（地図表示・ピン詳細画面）、SS-120（検索タブ）。Orval再生成はmobile側PRで行う
（backend PRのopenapi.yamlのみをmobileに伝達すればよい）。

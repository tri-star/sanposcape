---
name: sanposcape-backend-security-conventions
description: sanposcape backend で繰り返し確認済みのセキュリティ設計パターン（IDOR=user_id必須＋404、カーソルは無署名だがuser_idで絞る、本文サイズ制限、ログに出さないもの）と、既知の例外・受容済みのLow（レート制限の欠如）。指摘前にこれと照合する。
metadata:
  type: feedback
  scope: durable
---

対象は `packages/backend/src/sanposcape/`。ドメインごとに `router.py`/`service.py`/`repository.py`/
`schemas.py`/`mappers.py`/`exceptions.py`/`dependencies.py` を置き、ドメイン横断の型は `core/` に昇格する
（例: `core/geo.py::GeoPoint`、`core/pagination.py`）。

## IDOR・存在漏洩

- **repository のメソッドは `user_id` を必須キーワード引数に取る**（例: `walks/repository.py`
  `get_by_id(*, user_id, walk_id)`）。ID だけで引ける取得口（`find_by_id(id)`）は指摘対象。
  地図・ピンは `sanpo_map_members` を JOIN して絞る（ADR-009 決定9・決定21）。
- **他人のリソースは403ではなく404**（存在と所有を区別しない、意図的）。地図・ピンは
  「非メンバーは404、メンバーだが権限が無ければ403」の順で判定する（ADR-009 決定21・決定26）。
- **冪等キーは常に `(user_id, client_*_id)` の一意制約で、`user_id` は JWT の `current_user` から取る**
  （リクエスト本文からは取らない）。他人の冪等キーを推測・衝突させても他人の行には届かない。
- **既知の例外（安全確認済み）**: `sanpo_maps/maps/repository.py` の `count_pins_for_maps`/
  `list_photo_keys_for_map` は `user_id` を取らない。呼び出し元が `list_for_member(user_id=...)` の結果や、
  `FOR UPDATE` で権限確認済みの `sanpo_map_id` だけを渡すので安全（SS-113）。新しい呼び出し元を
  足す PR では、渡す ID が認可済みかを確認する。`find_attachments`（写真枠）は SS-88 後に
  `user_id` 必須へ修正済み。

## カーソル

- `core/pagination.py` のカーソル（`(datetime, uuid)` 用と `(int, uuid)` 用）は無署名の base64。
  これが安全なのは、デコードしたカーソルを使うクエリが必ず呼び出し元の `user_id`/メンバーシップでも
  絞っているから（カーソルは WHERE の境界値で、認可の入力ではない）。`user_id` の絞り込み無しで
  カーソルを使う新しい消費者は指摘する。
- **カーソルのデコードより先に認可する**（`PinService.list_pins`/`list_pin_photos` で確認済み）。逆だと
  非メンバーが不正なカーソルを送って 400（存在する）と 404（存在しない）を見分けられる。

## 本文サイズ・例外

- `core/middleware.py::RequestSizeLimitMiddleware` は `main.py` で prefix ごとに登録する
  （2026-10-04 時点: `/walks`・`/explore`・`/sanpo-maps`・`/pins`・`/pin-photo-uploads`、fake 時のみ
  `/dev-storage`）。登録されていない prefix は無制限なので、新しい書き込みエンドポイントの prefix が
  登録されているかを確認する。prefix 一致はセグメント単位（`/sanpo-mapsFOO` は一致しない）。
- アプリ全体の catch-all 500 ハンドラーは無く、ドメイン例外ごとのハンドラーのみ。`FastAPI(...)` は
  `debug=True` 無しで、未処理例外のスタックトレースは返らない。`debug=True` が入ったら Medium/High。

## ログに出さないもの

- `AccessLogMiddleware`（`core/observability.py`）は method・`scope["path"]`・status・経過msだけを出し、
  クエリ文字列・ヘッダー・本文は出さない。path を出すのが安全なのは、**全ルーターの path パラメータが
  `uuid.UUID` で、トークン類（id_token・refresh_token・cursor 等）はすべて本文かクエリにある**から。
  これは強制された不変条件ではないので、ルーターを追加する PR のたびに確認する。
- 写真アップロード枠の発行ログは `form.fields`（presigned POST の policy・署名・一時認証情報）を出さない。
  caplog の回帰テストで固定されている（`sanpo_maps/photos/tests/test_service.py`）。
- 位置情報: 周回ルートの service ログは lat/lng・place_id（内部生成の経由点も含む）を出さず、
  `maps/tests/test_service.py::test_get_loop_walking_route_logs_never_include_coordinates` で固定されている。
  座標を派生計算する新しいエンドポイントにも同じ caplog テストがあるかを確認する。

## 写真アップロード（SS-88、決定の正本は ADR-009）

- presigned POST は `content-length-range` と Content-Type の完全一致を条件に持ち、key は boto3 の暗黙条件で
  完全一致（`${filename}` は使わない）（ADR-009 決定4）。
- サムネイル生成の展開爆弾対策は、`Image.open()`（ヘッダーのみ）直後に `width*height > max_pixels` を
  確認してからデコードする（`sanpo_maps/photos/thumbnails.py`）。プロセス全体に効く
  `Image.MAX_IMAGE_PIXELS` に頼らないのは、`ThreadPoolExecutor` で並列実行するため（ADR-009 決定6）。
- `STORAGE_MODE=real|fake` + Unconfigured は `MAPS_MODE` と同じ fail-safe の形（ADR-009 決定8）。
  `integrations/aws/*` に新しい連携を足すときもこの形を踏襲しているかを見る。
- 既知の Low（dev/test 専用で影響小）: `sanpo_maps/photos/dev_storage_router.py` の
  `POST /dev-storage/uploads` は `max_bytes` の確認前にファイル全体をメモリに読む。

## 受容済みの Low: レート制限

backend にレート制限があるのは `/explore/*`（`maps/rate_limit.py::ExploreRateLimiter`、ユーザー/IP単位）
だけ。次はいずれも「認証必須で他ユーザーへの影響が無い」として受容済み。レート制限を backend 全体で
扱うときにまとめて提案する。
- `/auth/session`・`/auth/refresh`（[[sanposcape-auth-architecture-notes]]）
- `POST /walks` に1日あたりの件数上限が無く、`GET /walks/stats` は28日の窓内の全行を GROUP BY するため、
  自分の行を水増しすると集計のコストが比例して増える（SS-42。自分のデータにしか効かない）。
- `POST /pin-photo-uploads`・`POST /pins`・`POST /pins/{pin_id}/photos`・`POST/PATCH/DELETE /sanpo-maps`。
- 周回ルートは1リクエストで Google Routes を2〜3回呼ぶが、`/explore/places` とバケットを共有する。
  origin/destination の距離上限も無い（ADR-007 の SEC-L1/SEC-L2 として記録済み）。

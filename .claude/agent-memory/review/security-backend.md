---
name: security-backend
description: backend のセキュリティレビューの観点と再指摘しない点。IDOR（user_id 必須・404）、カーソルは認可の後にデコード、本文サイズ制限の prefix（/auth・/users は対象外で max_length だけ）、ログに出さないもの（caplog で固定）、認証の dev 迂回4層とローテーション、テスト DB の到達経路、受容済みのレート制限
metadata:
  type: feedback
  scope: durable
  adr: docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md
---

対象は `packages/backend/src/sanposcape/`。指摘する前にここと照合する。決定の正本は ADR-002（認証）・ADR-009 決定21・決定26（404/403）・ADR-013 決定6（ログ・スパンに出さないもの）。

**Why:** 確認済みの設計を毎回再調査したり、受容済みの事項を再指摘したりするコストを減らす。逆に、強制されていない不変条件（path パラメータに秘密を載せない等）は PR ごとに確かめる必要がある。

## 1. IDOR・存在の漏洩

- **repository のメソッドは `user_id` を必須キーワード引数に取る**（例: `walks/repository.py` の `get_by_id(*, user_id, walk_id)`）。ID だけで引ける取得口は指摘対象。
  地図・ピンは `sanpo_map_members` を JOIN して絞る。
- **他人のリソースは 403 ではなく 404**。地図・ピンは「非メンバーは 404、メンバーだが権限が無ければ 403」の順（ADR-009 決定21・決定26）。
- **冪等キーは `(user_id, client_*_id)` の一意制約で、`user_id` は JWT の `current_user` から取る**（本文から取らない）。
- 既知の例外（安全確認済み）: `sanpo_maps/maps/repository.py` の `count_pins_for_maps`/`list_photo_keys_for_map` は `user_id` を取らない。呼び出し元が
  メンバーシップで絞った結果や `FOR UPDATE` で権限確認済みの `sanpo_map_id` だけを渡すので安全。新しい呼び出し元では渡す ID が認可済みかを確かめる。

## 2. カーソル

- `core/pagination.py` のカーソルは無署名の base64。安全なのは、使うクエリが必ず呼び出し元の `user_id`／メンバーシップでも絞っているから（カーソルは WHERE の境界値で、認可の入力ではない）。
  絞り込みの無い新しい消費者は指摘する。
- **カーソルのデコードより先に認可する**（`PinService.list_pins`/`list_pin_photos`）。逆だと非メンバーが 400 と 404 の違いで存在を見分けられる。

## 3. 本文サイズ・例外

- `core/middleware.py::RequestSizeLimitMiddleware` は `main.py` で prefix ごとに登録する。2026-10-12 時点の対象は `/walks`・`/explore`・`/sanpo-maps`・`/pins`・
  `/pin-photo-uploads`（fake のときだけ `/dev-storage`）。**`/auth`・`/users` は対象外**で、`/auth` のトークン類は `auth/schemas.py` の `Field(max_length=...)`
  （`id_token`・`refresh_token`・`authorization_code`・`nonce`・`display_name`）でだけ長さを制限している（本文の大きさそのものは制限していない）。
  新しい書き込みエンドポイントの prefix が登録されているかを確かめる。prefix はセグメント単位で一致する（`/sanpo-mapsFOO` は一致しない）。
- 登録した prefix の router は、`responses` にも 413 を入れる（ミドルウェアは HTTP メソッドに依らず 413 を返すので、GET/DELETE に 413 があっても正しい。
  理由は `core/middleware.py` の docstring）。
- アプリ全体の catch-all 500 ハンドラーは無く、未処理例外は `AccessLogMiddleware` が握って 500 を返す。`FastAPI(...)` に `debug=True` が入ったら Medium/High。

## 4. ログ・スパンに出さないもの

- `AccessLogMiddleware`（`core/access_log.py`）は method・`scope["path"]`・status・経過 ms を出し、クエリ文字列・本文・ヘッダーは出さない。例外は検証済みの
  `X-App-Session-Id`（小文字の UUID v4 だけ。不正値は捨てる。認可には使わない）で、受容済みなので再指摘しない。path を出すのが安全なのは、
  **全ルーターの path パラメータが `uuid.UUID` で、トークン類は本文かクエリにある**から。これは強制された不変条件ではないので、ルーターを足す PR のたびに確かめる。
- 写真アップロード枠の発行ログは `form.fields`（presigned POST の policy・署名・一時認証情報）を出さない。位置情報（周回ルートの lat/lng・place_id）も出さない。
- **「ログに出さない」というコメントがある所には、caplog の回帰テストがあるか**を確かめる。先例は
  `integrations/aws/tests/test_secrets.py::test_resource_not_found_is_logged_without_secret_and_reraised`（メッセージに機密値が含まれないことを assert）、
  `sanpo_maps/photos/tests/test_service.py` の `test_logs_upload_id_and_key_without_leaking_form_fields`、
  `maps/tests/test_service.py::test_get_loop_walking_route_logs_never_include_coordinates`。
  ファイル移動ではロガー名が変わるので、`caplog.at_level(..., logger=...)` の文字列も直っているかを見る（直し忘れると INFO を拾えず静かに無意味になる）。

## 5. 認証（ADR-002）

- **dev-session の迂回は4層**: (1) `Settings.auth_mode` の既定は `real`、(2) `main.py` は `auth_mode == "dev"` のときだけ `auth_dev_router` を include
  （`include_in_schema=False`）、(3) `AuthService.create_dev_session` が `_assert_dev_mode` で再確認、(4) `config.py` の `_validate_environment_settings` が
  `env not in ("local", "test")` の許可リスト方式で、モード系（AUTH/MAPS/FEATURE_FLAG/STORAGE_MODE）が `real` でないこと・`AUTH_JWT_SECRET` の長さ・
  本番必須の設定の欠落を起動時に弾く。新しいモード系の設定は、このブロックに1行足す形か（別のバリデーターを作っていないか）を見る。
- real と dev が `_resolve_user()`/`_issue_session()` を共有する構造（ADR-002 決定3）は、`auth/tests/test_service.py::test_resolve_user_and_issue_session_shared_between_real_and_dev`
  と `auth/tests/test_dev_router.py::test_dev_session_token_passes_get_current_user` で固定されている。この構造を変える PR では、2つのテストが意味を保っているかを見る。
- Google ID token の検証（`auth/providers/google.py`）: `algorithms=["RS256"]` 固定、`aud` は許可リストと照合、`iss` は2種類あるので手動で照合（意図的）、
  `azp` は信用しない（意図的）。JWKS の取得失敗は 503 で fail-open しない。
- refresh token のローテーション: `SELECT ... FOR UPDATE` で同じトークンの同時 refresh を直列化し、再利用を検知したら `family_id` のチェーン全体を失効させる。
  正当な重複リトライもリプレイと同じに扱うのは意図どおりのトレードオフで、バグとして指摘しない。
- 自前のアクセス JWT は `HS256` 固定、`iss`/`aud`/`exp` と独自の `typ` で refresh と取り違えない。`local`/`test` で鍵が空のときだけ固定文字列にフォールバックする。
- 再指摘しないこと: staging に dev 迂回が漏れる穴（許可リスト方式で解消済み）。`env` の `Literal` に `dev`/`prod` を安易に足さない（ADR-005 決定6）。
  `MAPS_MODE=fake` は API キーより先に判定するので、実キーがあっても外部呼び出しは起きない。許可リストが `("local", "test")` なので実デプロイを `ENV=test` で
  起動すると fake/dev が通る点は既知の性質（そういうデプロイ定義が現れたら再指摘する）。

## 6. テスト DB の到達経路

`conftest.py`/`config.py` の DB まわりが変わる PR では、まず `Settings.test_database_url` が `database_dsn`（本番/staging のシークレット由来の DSN）を
参照していないことを確かめる。参照していなければ、テストの drop/delete が本番/staging に届く経路は構造的に無い（CI の `TEST_DB_NAME == DB_NAME` は
ジョブ専用の使い捨てコンテナ。ローカルの誤設定の防止がスコープ外なのは ADR-B-001 決定7）。

## 7. 受容済みの Low: レート制限

レート制限があるのは `/explore/*`（`maps/rate_limit.py::ExploreRateLimiter`、ユーザー/IP 単位）だけ。次はいずれも「認証必須で他のユーザーへの影響が無い」
などの理由で受容済み。backend 全体でレート制限を扱うときにまとめて提案する。
- `/auth/session`・`/auth/refresh`（Google ID token・256bit の refresh token は総当たりできない）。認証系に足す PR では、`ExploreRateLimiter` と同じ器を使うかを確かめる。
- `POST /walks` に1日あたりの件数上限が無い（`GET /walks/stats` のコストが自分の行数に比例するだけ）。
- `POST /pin-photo-uploads`・`POST /pins`・`POST /pins/{pin_id}/photos`・`POST/PATCH/DELETE /sanpo-maps`。
- 周回ルートは1リクエストで Google Routes を2〜3回呼ぶが `/explore/places` とバケットを共有する。距離上限も無い（ADR-007 の SEC-L1/SEC-L2）。

## 8. 写真アップロード（ADR-009）

- presigned POST は `content-length-range` と Content-Type の完全一致を条件に持ち、key は完全一致（`${filename}` は使わない）（決定4）。
- サムネイル生成の展開爆弾対策は、`Image.open()`（ヘッダーのみ）の直後に `width*height > max_pixels` を確かめてからデコードする。`Image.MAX_IMAGE_PIXELS` に
  頼らないのは `ThreadPoolExecutor` で並列実行するため（決定6）。
- `STORAGE_MODE=real|fake` + Unconfigured は `MAPS_MODE` と同じ fail-safe の形（決定8）。`integrations/aws/*` に連携を足すときもこの形かを見る。
- 既知の Low（dev/test 専用）: `POST /dev-storage/uploads` は `max_bytes` の確認前にファイル全体をメモリに読む。

関連: [[backend-code-quality]]

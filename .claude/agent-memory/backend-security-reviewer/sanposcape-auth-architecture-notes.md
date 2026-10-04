---
name: sanposcape-auth-architecture-notes
description: backend の認証（packages/backend/src/sanposcape/auth）と mode 系 fail-safe（AUTH/MAPS/FEATURE_FLAG/STORAGE_MODE）をレビューするときのチェックリスト。解消済みで再指摘しない点と、未対応（/auth/* のレート制限）の現状。
metadata:
  type: feedback
  scope: durable
  adr: docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md
---

認証は ADR-002（`docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md`）が正本。mobile は
Google に対する public client で、backend は Google ID token を1回だけ検証し、自前の短命 HS256
アクセス JWT + 不透明なローテーション式 refresh token を発行する。`AUTH_MODE=dev` で開く
`POST /auth/dev-session` は `user_key` で Google 検証を迂回するが、`AuthService`（`auth/service.py`）の
`_resolve_user`/`_issue_session` を real と共有するため、下流は構造的に同一。

## 再検証する点（いずれも SS-10 で正しく実装済み）

- **dev-session の迂回は4層**: (1) `Settings.auth_mode` の既定は `real`、(2) `main.py` は
  `auth_mode == "dev"` のときだけ `auth_dev_router` を include（`include_in_schema=False`）、
  (3) `AuthService.create_dev_session` が `_assert_dev_mode` を再確認、(4) `config.py` の
  `_validate_environment_settings` が **`env not in ("local", "test")` の許可リスト方式**で
  `AUTH_MODE`/`MAPS_MODE`/`FEATURE_FLAG_MODE`/`STORAGE_MODE` が `real` でないこと、
  `AUTH_JWT_SECRET` が32文字未満、`GOOGLE_ALLOWED_AUDIENCES`・`GOOGLE_MAPS_SERVER_API_KEY`・
  `DATABASE_DSN` 未設定を起動時に弾く（staging を含む）。
- **Google ID token 検証**（`auth/providers/google.py`）: `algorithms=["RS256"]` 固定（alg 混同対策）、
  `aud` は `google_allowed_audiences` と照合、`iss` は2種類あるため `verify_iss` を切って手動で許可リスト照合
  （意図的）、`azp` はプラットフォームごとに異なるため信用しない（意図的）。JWKS 取得失敗は 503
  （`IdentityProviderUnavailableError`）で fail-open しない。
- **refresh token のローテーション**（`auth/repository.py::get_by_hash_for_update` / `AuthService.refresh()`）:
  `SELECT ... FOR UPDATE` で同一トークンの同時 refresh を直列化し、再利用を検知したら `family_id` の
  チェーン全体を失効させる。正当な重複リトライも攻撃者のリプレイと同じに扱うのは OAuth の
  ローテーションの意図どおりのトレードオフで、バグとして指摘しない。`family_id` は端末/ログイン単位。
- **自前アクセス JWT**（`auth/tokens.py`）: `algorithms=["HS256"]` 固定、`iss`/`aud`/`exp` と独自の
  `typ` クレームで refresh/access の取り違えを防ぐ。`local`/`test` で `AUTH_JWT_SECRET` が空のときだけ
  リポジトリ内の固定文字列 `_INSECURE_DEV_JWT_SECRET` にフォールバックする（それ以外の env は上記の
  検証で起動失敗）。
- `get_current_user`（`dependencies.py`）が `sub` を信用するのはサーバー署名の JWT 由来だから。
  クライアントが指定するリソース ID が無いので IDOR の経路ではない。

## 再指摘しないこと（解消済み）

- staging に dev 迂回・固定署名鍵が漏れる穴（SS-10 指摘）→ 上記の許可リスト方式で解消。
  `config.py` のコメントに「実際に staging がこの罠を踏んだ」経緯がある。`env` の `Literal` に
  `dev`/`prod` を安易に足さない（ADR-005 決定6: アプリの `ENV` は `template.yaml` の `Mappings` で変換する）。
- `id_token`/`refresh_token` の長さ・本文サイズ無制限（SS-10 指摘）→ `core/middleware.py::RequestSizeLimitMiddleware`
  で解消（HTTP メソッド非依存で、GET/DELETE でも413があり得る）。
- `MAPS_MODE=fake`（SS-44）: `build_google_maps_provider` は API キーの有無より先に `maps_mode == "fake"` を
  判定するので、実キーが誤って設定されていても外部呼び出し・課金は起きない。fake は provider 層だけに
  注入され、認証・レート制限・リクエスト検証には触れない。
- 許可リストが `("local", "test")` なので、実デプロイを `ENV=test` で起動すると fake/dev が通る点は
  既知の性質（新しい許可リストを別に作らず同じブロックを使う意図的な設計）。デプロイ定義に
  `ENV=test` を使うものが現れたら再指摘する。

## 未対応

- **`/auth/session`・`/auth/refresh` にレート制限が無い**（`auth/router.py` に参照なし。2026-10-04 確認）。
  Google ID token・256bit の refresh token は総当たりできないので優先度は低い。認証系にレート制限を
  足す PR を見たら、`maps/rate_limit.py::ExploreRateLimiter` と同じ器を使うか別建てにするかを確認する。
  ほかのエンドポイントのレート制限の状況は [[sanposcape-backend-security-conventions]]。
- 新しい mode 系設定（別の外部連携の fake 化など）は、`_validate_environment_settings` の同じブロックに
  1行足す形か（新しいバリデータを作っていないか）を確認する。

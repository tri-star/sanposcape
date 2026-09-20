---
name: ss10-auth-review-findings
description: Findings from the SS-10 backend auth review (feat/ss-10-backend-auth) — track whether these get fixed in follow-up branches.
metadata:
  type: feedback
  scope: durable
---

Reviewed `packages/backend/src/sanposcape/auth/` + `users/` + `config.py` + `dependencies.py` +
`main.py` on branch `feat/ss-10-backend-auth` (2026-07-25). Overall implementation is strong
(alg-confusion tests, `FOR UPDATE` row locking for refresh rotation, dev-router multi-layer
defense, no plaintext refresh token storage). **2026-09-20 棚卸しで再検証した結果を各項目に追記した。1 と 2 は解消済み、3 は `/auth/*` について未対応。**

1. **`Settings._validate_auth_settings` in `packages/backend/src/sanposcape/config.py` only
   hardens `env == "production"`.** `env` is `Literal["local", "test", "staging", "production"]`,
   but a `staging` deployment left with `AUTH_MODE=dev` and no `AUTH_JWT_SECRET` would silently
   fall back to the hardcoded `_INSECURE_DEV_JWT_SECRET` (a public string committed to the repo)
   AND expose `/auth/dev-session`. No deployment manifests for staging exist in the repo yet
   (only `compose.yaml`/CI, both default to `real`/`local`), so this is not exploited today — but
   if a staging environment is stood up later without deliberately setting these two env vars,
   it's a full auth-bypass. Recommend the validator treat anything `!= "local"` (or an explicit
   allowlist of non-prod envs) as requiring the same guardrails as production, or that
   staging deploys are required to set `ENV=production` for this check to bite.
   **解消済み（2026-09-20 確認）。** `_validate_auth_settings` は `_validate_environment_settings` に
   改名され、**許可リスト方式（`if self.env not in ("local", "test")`）**へ変わっている。
   推奨した「production 以外も同じガードを要求する」形そのもの。`AUTH_MODE` / `MAPS_MODE` が
   `real` でないこと、`AUTH_JWT_SECRET` が32文字未満、`GOOGLE_ALLOWED_AUDIENCES` /
   `GOOGLE_MAPS_SERVER_API_KEY` / `DATABASE_DSN` 未設定を、いずれも `staging` でも弾く。
   `config.py` のコメントには**実際に staging がこの罠を踏んで認証バイパスになっていた**ことと、
   `env` の `Literal` に `dev`/`prod` を安易に足さないことが記録されている
   （ADR-005 決定6）。**この項目を未解決として再指摘しないこと。**
   **Why:** matches the review instruction to check whether the dev-only bypass can leak into any
   real deployment, not just literally `env=="production"`.
   **How to apply:** when reviewing future changes to `config.py` or to deployment configs that
   introduce a staging target, check whether this gap was addressed.

2. **No `max_length` constraints on `id_token` / `refresh_token` (schemas.py) or `user_key`
   (DevSessionCreate)**, and no `Content-Length`/body-size-limiting middleware anywhere in
   `packages/backend/src/sanposcape/`. Low/Medium DoS concern (large-payload memory pressure per
   request), flagged as a recommendation rather than a blocking finding since it applies broadly
   and not specifically to auth.
   **解消済み（2026-09-20 確認）。** `core/middleware.py::RequestSizeLimitMiddleware` が導入され、
   `Content-Length` 詐称とストリーミング受信量の両方で 413 を返す。HTTP メソッドを見ない設計なので
   GET/DELETE でも 413 があり得る（[[project_sanposcape_conventions]]）。

3. **No rate limiting library anywhere in the backend** (`grep -rn "slowapi|RateLimit|limiter"`
   found nothing). `/auth/session` and `/auth/refresh` have no brute-force throttling. Lower risk
   given Google ID tokens and 256-bit opaque refresh tokens aren't brute-forceable, but still
   worth a recommendation for future hardening (also applies beyond auth).
   **部分的に解消（2026-09-20 確認）。** `maps/rate_limit.py::ExploreRateLimiter` が `main.py` で
   組み込まれ `/explore/*` はユーザー/IP ごとに絞られているが、**`/auth/session` /
   `/auth/refresh` には依然としてスロットリングが無い。** `auth/router.py` に rate limit の
   参照は無い。認証系にレート制限を足す PR を見たら、`ExploreRateLimiter` と同じ器を使うか
   別建てにするかを確認する。

See [[sanposcape_auth_architecture_notes]] for the defense-in-depth pattern this review
confirmed was implemented correctly (dev-router layering, refresh rotation/reuse detection).

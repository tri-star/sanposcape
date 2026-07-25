---
name: sanposcape-auth-architecture-notes
description: What to check when reviewing changes to sanposcape's backend auth module (packages/backend/src/sanposcape/auth) — checklist derived from ADR-002.
metadata:
  type: project
---

sanposcape backend auth follows ADR-002 (`docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md`):
mobile is a public client to Google, backend verifies the Google ID token once and mints its own
short-lived HS256 access JWT + opaque rotating refresh token. `AUTH_MODE=dev` (default `real`)
unlocks `POST /auth/dev-session` which bypasses Google verification via a `user_key`, but shares
`_resolve_user`/`_issue_session` with the real path (`AuthService` in `auth/service.py`) so dev
and real sessions are structurally identical downstream.

When reviewing future PRs that touch this area, re-verify these specific things (each was
correctly implemented as of the SS-10 review, 2026-07-25):

- **Dev-session bypass has 4 independent layers**: (1) `Settings.auth_mode` defaults to `real`,
  (2) `main.py` only calls `app.include_router(auth_dev_router)` when `settings.auth_mode ==
  "dev"`, (3) `AuthService.create_dev_session` re-checks `_assert_dev_mode` and raises
  `RuntimeError` if not dev, (4) `ENV=production` forces `AUTH_MODE=real` at startup via a
  pydantic `model_validator`. See [[ss10_auth_review_findings]] for the one gap found (staging
  env not covered by layer 4).
- **Google ID token verification** (`auth/providers/google.py`) pins `algorithms=["RS256"]`
  (blocks alg-confusion), verifies `aud` against `google_allowed_audiences`, manually checks
  `iss` against an allowlist (Google has two valid issuer strings so `verify_iss` is disabled and
  done manually — this is intentional, not a shortcut), and does NOT trust `azp` (documented
  reasoning: azp differs per-platform for native sign-in, so a fixed check would break one
  platform). JWKS connection failures map to 503 (`IdentityProviderUnavailableError`), not silent
  accept — confirmed not fail-open.
- **Refresh token rotation** (`auth/repository.py` `get_by_hash_for_update` / `auth/service.py
  refresh()`) uses `SELECT ... FOR UPDATE` to serialize concurrent refresh calls on the same
  token, then reuse detection revokes the whole `family_id` chain. This is intentional OAuth
  refresh-rotation semantics (a legitimately-retried duplicate request is treated the same as an
  attacker replaying a stolen token) — don't flag this as a bug, it's the documented tradeoff.
  `family_id` scopes to one device/login session, not the whole user, so logout/reuse-revocation
  on one device doesn't affect other devices' sessions.
- Own access JWT (`auth/tokens.py`) pins `algorithms=["HS256"]`, checks `iss`/`aud`/`exp`, and a
  custom `typ` claim to stop refresh-token/access-token confusion. Non-prod falls back to a
  hardcoded dev secret (`_INSECURE_DEV_JWT_SECRET` in `config.py`) — safe today because it's
  gated on `env=="production"`, but see [[ss10_auth_review_findings]] for the staging caveat.
- `get_current_user` (`dependencies.py`) trusts `sub` only because it comes from a
  server-signed JWT, not a client-supplied resource ID — no IDOR risk from this path since there's
  no user-controllable ID parameter involved.

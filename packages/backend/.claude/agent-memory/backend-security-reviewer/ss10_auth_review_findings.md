---
name: ss10-auth-review-findings
description: Findings from the SS-10 backend auth review (feat/ss-10-backend-auth) — track whether these get fixed in follow-up branches.
metadata:
  type: project
---

Reviewed `packages/backend/src/sanposcape/auth/` + `users/` + `config.py` + `dependencies.py` +
`main.py` on branch `feat/ss-10-backend-auth` (2026-07-25). Overall implementation is strong
(alg-confusion tests, `FOR UPDATE` row locking for refresh rotation, dev-router multi-layer
defense, no plaintext refresh token storage). Two things worth re-checking in future reviews of
this area:

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
   **Why:** matches the review instruction to check whether the dev-only bypass can leak into any
   real deployment, not just literally `env=="production"`.
   **How to apply:** when reviewing future changes to `config.py` or to deployment configs that
   introduce a staging target, check whether this gap was addressed.

2. **No `max_length` constraints on `id_token` / `refresh_token` (schemas.py) or `user_key`
   (DevSessionCreate)**, and no `Content-Length`/body-size-limiting middleware anywhere in
   `packages/backend/src/sanposcape/`. Low/Medium DoS concern (large-payload memory pressure per
   request), flagged as a recommendation rather than a blocking finding since it applies broadly
   and not specifically to auth.

3. **No rate limiting library anywhere in the backend** (`grep -rn "slowapi|RateLimit|limiter"`
   found nothing). `/auth/session` and `/auth/refresh` have no brute-force throttling. Lower risk
   given Google ID tokens and 256-bit opaque refresh tokens aren't brute-forceable, but still
   worth a recommendation for future hardening (also applies beyond auth).

See [[sanposcape_auth_architecture_notes]] for the defense-in-depth pattern this review
confirmed was implemented correctly (dev-router layering, refresh rotation/reuse detection).

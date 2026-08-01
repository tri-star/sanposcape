---
name: project-sanposcape-conventions
description: Recurring backend security design patterns in sanposcape (IDOR handling, cursor pagination, request-size middleware, exception-handler style) — check these still hold before flagging as issues.
metadata:
  type: project
---

Observed conventions in `packages/backend/src/sanposcape/` as of the SS-18 (walks) review (2026-08-01):

- **IDOR pattern**: repository classes require `user_id` as a mandatory keyword arg on every
  read/write method (e.g. `walks/repository.py` `get_by_id(*, user_id, walk_id)`,
  `list_for_user(*, user_id, ...)`). There is no "get by id only" method, so it's structurally
  hard to forget the owner-scope filter. When reviewing new domains, check for the same shape
  (`find_by_id(id)` with no `user_id` is the anti-pattern to flag).
- **404 not 403 for cross-owner access**: not-found and not-owned are deliberately
  indistinguishable (see `walks/exceptions.py::WalkNotFoundError`, D6 in backend-plan). This is
  intentional, not an oversight — do not flag missing 403 differentiation as a bug.
- **Idempotency keys are client-generated UUIDs but always scoped by `(user_id, client_walk_id)`**
  unique constraint + service always takes `user_id` from `current_user` (JWT), never from the
  request body. This means a client cannot use another user's guessed/collided `client_walk_id`
  to read or affect another user's row — the row is always created/looked-up under the
  authenticated user's own `user_id`. Confirmed safe pattern, not just "unlikely to collide."
- **Keyset pagination cursors are unsigned/unencrypted** (`core/pagination.py`: base64 of
  `"{started_at isoformat}|{uuid}"`, no HMAC). This is safe here only because every repository
  query that consumes the decoded cursor also applies the caller's own `user_id` filter — the
  cursor is just a WHERE-clause bound, never itself an authorization input. If a future endpoint
  reuses this cursor utility without a hard `user_id` filter alongside it, that would be a real
  IDOR/enumeration risk — check for that when reviewing new consumers of `core/pagination.py`.
- **Request-size limiting**: `main.py::RequestSizeLimitMiddleware` is a generic ASGI
  streaming body-size guard keyed by `path_prefix`, registered once per prefix via
  `app.add_middleware(..., path_prefix=..., max_bytes=...)`. Originally `/explore`-only, now
  reused for `/walks` (SS-18) with a distinct, larger byte cap. When new write endpoints are
  added, check whether they need their own prefix registration (default is *no* limit — only
  prefixes explicitly registered are covered).
- **No app-wide catch-all 500 handler**: `main.py` registers per-exception-type handlers only
  (`register_exception_handlers`); FastAPI/Starlette's default (no `debug=True` on `FastAPI()`)
  is relied on to avoid leaking stack traces on unhandled exceptions. Confirmed `FastAPI(...)` is
  constructed without `debug=True`. If that ever changes, stack-trace leakage becomes a real
  Medium/High finding.
- **Domain layout**: `routers/services/repositories/schemas/mappers/exceptions/dependencies.py`
  per domain (e.g. `walks/`), with cross-domain shared types promoted to `core/` (e.g.
  `core/geo.py::GeoPoint`, `core/pagination.py`). Old import paths are kept as re-exports for
  backward compatibility (see `maps/schemas.py` re-exporting `GeoPoint` from `core/geo.py`).

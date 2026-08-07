---
name: project-ss44-maps-fake-review
description: SS-44 (feat/ss-44-fake-maps-provider) security review outcome — MAPS_MODE fake provider fail-safe pattern, no Critical/High findings.
metadata:
  type: project
---

Reviewed 2026-08-08: `FakeGoogleMapsProvider` (`packages/backend/src/sanposcape/integrations/google_maps/fake.py`)
+ `Settings.maps_mode` fail-safe added to the *same* `_validate_environment_settings` block as
`AUTH_MODE` (`config.py`). No Critical/High findings.

- **Pattern confirmed safe**: `build_google_maps_provider` checks `maps_mode == "fake"` *before*
  checking `google_maps_server_api_key` presence — explicit fake selection always wins over an
  accidentally-configured real key (no accidental billing/external call). This mirrors the
  existing dev-mode-bypass defense style noted in [[sanposcape_auth_architecture_notes]].
- **fake never touches auth**: it's injected purely at the provider layer, below
  `get_current_user`/`enforce_explore_rate_limit` in `maps/router.py`/`maps/dependencies.py` — no
  router-level changes were needed or made. Confirmed `/explore/*` Bearer auth unchanged.
- **fake never touches request validation**: `category` values fed into `PlaceCandidate` come
  only from the caller-supplied, already-`ExploreCategory`-validated `categories` tuple (cycled),
  never synthesized — so it can't produce a Pydantic response-validation 500. Coordinates are
  clamped to GeoPoint's `ge`/`le` bounds before being wrapped in `ProviderPoint`.
- **One Low/non-blocking observation, not new**: the fail-safe allowlist is `env not in ("local",
  "test")` — same shape as the AUTH_MODE allowlist from [[ss10_auth_review_findings]]. This means
  `ENV=test` on a real deployment would also silently permit `MAPS_MODE=fake` (plus `AUTH_MODE=dev`
  auth bypass) together. Not a new risk introduced by SS-44 — it's inherited from the existing
  AUTH_MODE design this PR intentionally mirrors (per its own plan doc, reusing the *same*
  validation block is deliberate to avoid a second allowlist drifting out of sync). Worth
  re-flagging if/when staging or production deploy manifests are ever added to the repo (none
  exist yet as of this review).
- Full report saved to `tmp/SS-44/review-security.md` (task-root, not memory — do not treat as
  authoritative after the branch merges/changes).

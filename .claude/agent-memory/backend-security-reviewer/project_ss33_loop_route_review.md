---
name: project-ss33-loop-route-review
description: SS-33 (tri-star/SS-33-claude) POST /explore/routes/loop security review outcome — no Critical/High/Medium; two Low findings around missing origin/destination distance cap and rate-limit sharing.
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-007-loop-route-generation.md
---

Reviewed 2026-09-15: `POST /explore/routes/loop` (`maps/router.py`, `maps/service.py`,
`maps/loop_route.py`, `maps/geometry.py`, `integrations/google_maps/client.py`,
`integrations/google_maps/fake.py`, `scripts/loop_route_probe.py`). No Critical/High/Medium
findings, two Low findings (see below). Full report was written to the task's tmp review file at
review time; do not rely on that path after SS-33 closes — the points below are the durable
summary.

- **Pattern confirmed safe (extends [[project_sanposcape_conventions]])**: new endpoint reuses the
  same `enforce_explore_rate_limit` dependency as `/explore/places` (shared bucket, optional auth
  via `get_current_user_optional`) — no new auth/rate-limit gap. Body-size middleware
  (`RequestSizeLimitMiddleware`, `path_prefix="/explore"`) covers the new path automatically
  (prefix match), confirmed by `test_loop_route_body_size_is_limited_before_auth_or_parsing`.
- **Coordinate/place_id logging discipline confirmed**: `service.py`'s loop logging (INFO/WARNING)
  emits only side/accepted/reason/metric values, never lat/lng or place_id — even the internally
  generated `via` waypoint. Pinned by a `caplog`-based test in `test_service.py`
  (`test_get_loop_walking_route_never_logs_coordinates` area, ~line 412). This is a
  deliberately-designed pattern worth checking for in future `maps/` or `walks/` location-handling
  reviews — any new endpoint that computes derived waypoints/coordinates should have the same
  caplog assertion.
- **Thread safety confirmed**: the new `ThreadPoolExecutor(max_workers=2)` parallel fetch (left/right
  waypoint candidates) calls into `TtlCache`/`SingleFlight` (`integrations/google_maps/cache.py`),
  both `threading.Lock`-protected — no race condition introduced by going parallel.
- **Low finding, non-blocking, not new**: `GeoPoint` (`core/geo.py`) has lat/lng range validation
  only, no max-distance-between-origin-and-destination constraint — pre-existing gap shared with
  `/explore/routes/walking`. SS-33 amplifies it slightly because `loop_route.py::evaluate_loop`
  now runs `resample()`/`grid_cells()` over the returned polyline for *two* parallel candidates
  per request (new CPU cost that scales with route length, on top of the pre-existing external-call
  cost). Recommended as a follow-up note in ADR-007's "移行・対応が必要な事項" section if it isn't
  already there. Worth re-checking if a future PR touches `GeoPoint` or adds another
  polyline-heavy endpoint.
- **Low finding, deliberate design tradeoff, not new**: loop requests always cost 2-3 upstream
  Google Routes calls (vs. 1 for plain walking), rate limit bucket unchanged (shared with
  `/explore/places`, which already amplifies up to 21x per search) — the backend plan explicitly
  reasoned this is smaller than the existing places amplification, so not flagged as a new attack
  surface. Recommended operational monitoring via Cloud Billing alerts rather than a code fix.
- **Probe script confirmed dev-only**: `scripts/loop_route_probe.py` requires `MAPS_MODE=real` +
  a real API key read via `get_settings()`, uses `yaml.safe_load` (not `yaml.load`), writes GeoJSON
  only to `.gitignore`d `tmp-probe/`. Not wired into CI/prod. No secrets hardcoded.

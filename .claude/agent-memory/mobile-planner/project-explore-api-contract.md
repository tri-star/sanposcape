---
name: project-explore-api-contract
description: /explore/places returns a one-way-times-2 approximation but /explore/routes/loop returns the actual loop-route value — easy to conflate when planning mobile display logic
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-001-map-poi-google-maps-platform.md
---

The `/explore/*` endpoints mobile actually uses (as of SS-33) are:

- `POST /explore/places` → `PlaceCandidate.round_trip_duration_seconds` / `round_trip_distance_meters`
  are still the **one-way Routes value doubled by the backend** (an approximation for the candidate
  list). Mobile keeps these as `SpotCandidate.roundTripMinutes`/`roundTripKm`, unchanged by SS-33.
- `POST /explore/routes/loop` → returns the **actual loop route** the user selected: `legs` is always
  exactly 2 elements `[outbound, return]`, `return_is_same_path` flags the "walk back the same way"
  fallback, and `duration_seconds`/`distance_meters` are the **sum over both legs** (the whole loop,
  not one-way). Mobile stores this as `ActiveWalk.loopMinutes`/`loopKm`.
- `POST /explore/routes/walking` (the old one-way endpoint) is **`deprecated: true`** as of SS-33.
  Mobile no longer calls it (`walkRouteApi.ts` calls `/explore/routes/loop`); it stays in the OpenAPI
  spec only for backward compatibility with older backend consumers.

**Why:** the doubling for `/explore/places` lives only in `MapsService.search_places` (unchanged
since before SS-33 — computing a real loop per candidate would multiply external API calls by the
candidate count, which was rejected as not worth the cost). The loop endpoint computes outbound +
return independently via `MapsService.get_walking_loop_route`, so its total is a real measured sum,
not a doubled approximation. Nothing in the field names signals this asymmetry — verify at
`packages/backend/src/sanposcape/maps/service.py` before relying on it.

**How to apply:** when planning any mobile screen that shows an ETA/distance, be explicit about
which source it comes from: the candidate list (`/explore/places`, approximation, doesn't need a
route yet) vs. the walk-start/walk-active screens (`/explore/routes/loop`, real value, available only
after a spot is selected). The two numbers legitimately differ (the list one tends to run shorter);
this is an accepted, user-confirmed trade-off — don't plan a "fix" that makes them match without
re-confirming with the user. Both endpoints still share **one** rate-limit bucket
(`enforce_explore_rate_limit`, default 30 req / 60 s per user, and `/explore/routes/loop` counts
against the same bucket), so per-tap route fetching still needs aggressive TanStack Query
`staleTime`/`gcTime`.

Related: [[project-e2e-ci-constraints]], [[project-walk-domain-contract]]

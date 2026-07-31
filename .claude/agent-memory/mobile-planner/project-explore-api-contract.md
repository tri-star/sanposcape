---
name: project-explore-api-contract
description: /explore/places returns round-trip values but /explore/routes/walking returns one-way — easy to conflate when planning mobile display logic
metadata:
  type: project
---

The two `/explore/*` endpoints use **different duration/distance conventions**:

- `POST /explore/places` → `PlaceCandidate.round_trip_duration_seconds` / `round_trip_distance_meters` are the **one-way Routes value doubled by the backend**.
- `POST /explore/routes/walking` → `duration_seconds` / `distance_meters` are **one-way, not doubled**.

**Why:** the doubling lives only in `MapsService.search_places`; `MapsService.get_walking_route` passes the provider value straight through. Verify at `packages/backend/src/sanposcape/maps/service.py` before relying on this — it is a deliberate contract, not a bug, but nothing in the OpenAPI field names signals the asymmetry.

**How to apply:** when planning any mobile screen that shows an ETA from the walking-route API, state explicitly that the value is one-way and that a round-trip figure must be computed by doubling. Also note that both endpoints share **one** rate-limit bucket (`enforce_explore_rate_limit`, default 30 req / 60 s per user), so per-tap route fetching needs aggressive TanStack Query `staleTime`/`gcTime`.

Related: [[project-e2e-ci-constraints]]

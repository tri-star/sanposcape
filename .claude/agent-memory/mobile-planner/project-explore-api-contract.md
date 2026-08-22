---
name: project-explore-api-contract
description: /explore/places returns round-trip values but /explore/routes/walking returns one-way — easy to conflate when planning mobile display logic
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-001-map-poi-google-maps-platform.md
---

The two `/explore/*` endpoints use **different duration/distance conventions**:

- `POST /explore/places` → `PlaceCandidate.round_trip_duration_seconds` / `round_trip_distance_meters` are the **one-way Routes value doubled by the backend**.
- `POST /explore/routes/walking` → `duration_seconds` / `distance_meters` are **one-way, not doubled**.

**Why:** the doubling lives only in `MapsService.search_places`; `MapsService.get_walking_route` passes the provider value straight through. Verify at `packages/backend/src/sanposcape/maps/service.py` before relying on this — it is a deliberate contract, not a bug, but nothing in the OpenAPI field names signals the asymmetry.

**How to apply:** when planning any mobile screen that shows an ETA from the walking-route API, state explicitly that the value is one-way and that a round-trip figure must be computed by doubling. Also note that both endpoints share **one** rate-limit bucket (`enforce_explore_rate_limit`, default 30 req / 60 s per user), so per-tap route fetching needs aggressive TanStack Query `staleTime`/`gcTime`.

**SS-33 でこの非対称性は変わる（2026-08-22 時点で両パッケージのプランが確定・未マージ）**:

- `/explore/routes/walking`: `duration_seconds` / `distance_meters` / `path` / `bounds` が**周回全体**の値になる
  （破壊的変更）。`legs[{kind: outbound|return, duration_seconds, distance_meters, path}]`（loop は必ず2件・
  one_way は空）、`return_is_same_path`、レスポンスの `route_type` エコーが追加され、
  リクエストに `route_type: "loop" | "one_way"`（既定 loop）が入る。
  `destination.place_id` は **`route_type` によらず常に任意**（`str | None`）になる。
  周回では `duration == Σlegs` / `path == legs の連結` が**恒等的に成立**する（backend が legs から構築するため）。
- `/explore/places`: フィールド名・型は不変だが、`round_trip_*` の**値**が `片道×2×LOOP_FACTOR` の補正後になる
  （＝ 上記の「片道×2」は SS-33 で解消される。係数は backend 設定 `GOOGLE_MAPS_LOOP_DURATION_FACTOR`）。
- `destination.name` は**空文字を返しうる**（place_id も name も無いリクエスト）。詳細は [[project-display-text-ownership]]。

→ **参照前に `packages/backend/src/sanposcape/maps/schemas.py` と `openapi.yaml` を必ず確認し、
`legs` が入っていたらこの追記の側が現行**。入っていなければ上記の片道前提が現行。

Related: [[project-e2e-ci-constraints]]

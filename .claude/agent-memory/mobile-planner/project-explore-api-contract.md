---
name: project-explore-api-contract
description: /explore/* の契約 — places は片道×2近似 / routes/loop は周回実値（混同しやすい）。加えて places のコスト構造と呼び出し抑制ルール（1探索=Places1回+Routes最大20回、30req/60s）
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

## `POST /explore/places` の契約とコスト制約（SS-14 で backend 実装済み）

知らずにプランを書くと外部 API コストが跳ね上がる／不要なクライアント実装を作ってしまう。
一次資料: `packages/backend/openapi.yaml`、`maps/service.py`、`integrations/google_maps/client.py`。

- 契約: `origin{latitude,longitude}` / `round_trip_duration_minutes`(10..120, **multipleOf 5**) /
  `categories`(ExploreCategory 1..6) / `limit`(1..20, 既定20)。要 Bearer。
  エラー 401 / 413 / 429 / 503 / 422（**いずれも本文なし＝status だけで文言を出し分ける**）。
- `ExploreCategory` = `convenience_store|supermarket|retail|facility|park|station`。
- **候補は backend が「往復時間超過を除外」＋「往復時間昇順→距離昇順でソート」済みで返す**
  → mobile 側にクライアント絞り込み・ソートは不要。
- **1 探索 = Places 1回 + 候補ごとの Routes 呼び出し（最大20回）。** レート上限はユーザー/IP ごと
  既定 30req/60s（超過 429）。→ **「スライダーは指を離した時だけ」「カテゴリはシート確定時だけ」
  再探索する設計が必須。**
- provider キャッシュキーは `places:{lat:.4f}:{lng:.4f}:{sorted(categories)}:{limit}`（TTL既定300秒）
  → mobile も **origin を小数4桁に丸め、categories をソートして送る**とヒット率が上がる。
- **`GOOGLE_MAPS_SERVER_API_KEY` 未設定の backend は `UnconfiguredGoogleMapsProvider` で常に 503。**
  ローカル/CI で候補0件・503 になるのは正常。**E2E で候補件数に依存する assert を書かないこと。**

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

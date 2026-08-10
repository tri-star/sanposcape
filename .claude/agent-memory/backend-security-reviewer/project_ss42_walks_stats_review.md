---
name: project-ss42-walks-stats-review
description: Outcome of the SS-42 (GET /walks/stats aggregation endpoint) security review, commit 49effbf, reviewed 2026-08-09 — no Critical/High/Medium findings, one Low (write-amplification DoS via unlimited walks/day feeding a per-request aggregate scan).
metadata:
  type: project
---

Reviewed commit `49effbf` (`packages/backend/src/sanposcape/walks/{router,service,repository,
schemas,mappers,stats}.py` + tests) against ADR-003 SS-42 addendum (決定10〜12) and
`tmp/ss-42/backend-plan.md`.

**Result: no Critical/High/Medium findings.**

- IDOR: not applicable in the traditional sense — `GET /walks/stats` takes **no resource-id
  input at all** (no path/query param naming a walk). `current_user.id` from the JWT is the only
  key passed to both new repository methods (`aggregate_daily_for_user`,
  `list_walk_dates_desc`), both of which require `user_id` as a mandatory kwarg, consistent with
  [[project-sanposcape-conventions]]. `test_service.py::test_t5_only_returns_own_data` /
  `TestGetWalkStats::test_t5_only_returns_own_data` (router level) confirm cross-user isolation.
- SQL injection: `func.timezone(timezone_name, Walk.started_at)` binds `timezone_name` as a
  SQLAlchemy parameter (not string-formatted), and it's always the hardcoded constant
  `WALK_STATS_TIMEZONE = "Asia/Tokyo"` (`walks/stats.py`) — never derived from request input.
  Confirmed safe both structurally (parameterized) and by data flow (no user-controlled tz).
- DoS / safety valve: the streak walk (`WalkService._count_streak_days`) is a chunked
  index-order scan (`ORDER BY started_at DESC LIMIT WALK_STATS_STREAK_CHUNK_SIZE=200`) with a
  hard cap `WALK_STATS_STREAK_MAX_DAYS=3660` → max ~19 round-trip queries per request,
  each hitting the existing `(user_id, started_at desc, id desc)` index. This is a deliberately
  good pattern (avoids "read the whole user history to compute a streak") — reference this design
  if reviewing future streak/rolling-aggregate features in this repo.
  The 28-day bucket aggregate (`aggregate_daily_for_user`) is bounded by a fixed date range
  (`STATS_WINDOW_DAYS=28`), not by row count within that range.

**One Low finding**: there is no cap on how many `Walk` rows a single user can create per day
(`POST /walks` has no daily-count limit, only per-request payload limits via
`WalkCreate` field constraints), and no rate limiting anywhere in the backend (confirmed again,
same gap as [[ss10-auth-review-findings]] / [[project-ss18-walks-review]]). Because
`GET /walks/stats` does a `GROUP BY` scan over *all* rows in the 28-day window (not just a fixed
number), a user who has inflated their own row count within that window (e.g. scripted repeated
`POST /walks`) makes every subsequent `GET /walks/stats` call proportionally more expensive to
compute — a repeatable, cheap-for-attacker/costly-for-server amplification, unlike the O(1)-ish
cost of `GET /walks/{id}`. Not blocking (write cost is paid once by the attacker, and it's
self-inflicted against their own data only — no cross-user impact), but worth a defense-in-depth
recommendation: either a per-day walk-creation cap, or basic rate limiting / short-TTL caching on
`GET /walks/stats` specifically, next time rate limiting is addressed backend-wide.

**Why this matters for future reviews**: this is the first "pure aggregate, no resource-id"
endpoint in `walks/` — good reference for the "no IDOR surface because no id input" case, and for
the chunked-scan-with-safety-valve pattern for rolling/streak-style computations that would
otherwise require full-history reads.

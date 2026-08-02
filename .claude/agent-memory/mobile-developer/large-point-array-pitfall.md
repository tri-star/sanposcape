---
name: large-point-array-pitfall
description: Never spread a walk track array into Math.max/Math.min — tracks can have up to 10,000 points (ADR-003) and risk a stack overflow
metadata:
  type: feedback
---

Walk tracks (`GeoCoordinates[]` from `WalkDetailRead.track`) can have up to `MAX_TRACK_POINTS =
10_000` points (see `features/walk/lib/walkTrackPayload.ts`, backed by ADR-003). Calling
`Math.max(...points.map(p => p.latitude))` risks blowing the JS call-stack argument limit on some
engines/point counts.

**Why:** this was an explicit requirement from the SS-20 plan when writing
`src/lib/mapRegion.ts` (`regionForCoordinates`), which computes a map bounding region from an
arbitrarily large track. A regression test with 10,000 synthetic points was written specifically
to guard this (`src/lib/mapRegion.test.ts`).

**How to apply:** any time you need min/max (or similar reduction) over a coordinate/track array
that could plausibly hold hundreds+ of points, use a single `for` loop accumulating
min/max instead of `Math.max(...array)`/spread. This applies anywhere walk tracks or route path
arrays are processed, not just `mapRegion.ts`.

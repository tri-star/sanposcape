---
name: project-walk-domain-contract
description: How backend /walks maps onto mobile's active-walk state — the values that are NOT interchangeable and where the idempotency key is minted
metadata:
  type: project
---

SS-18（backend）と SS-16（mobile 散歩開始・散歩中）の境界。散歩まわりのプランで毎回効く。

- **`duration_seconds` は wall-clock ではない**。mobile の `elapsedSec`（`lib/walkElapsed.ts`、一時停止を除いた実活動秒）を送る。backend は `ended_at - started_at` から導出せず別カラムで保存し、`duration_seconds <= wall_clock + 300s` だけ検証する（ADR-003 D4）。
- **`distance_meters` は GPS ノイズ除去後の値**。`lib/walkTrack.ts` が 5m 未満の移動を捨てる。サーバーは軌跡から再計算しない。
- **`client_walk_id` は散歩開始時に採番**して `ActiveWalk` に載せる（保存直前に採番するとリトライで値が変わり冪等性が壊れる）。`UNIQUE(user_id, client_walk_id)`、新規 201 / 再送 200。
- **軌跡の制約**: 最大 10,000 点、小数6桁、`/walks` の本文上限 1MiB。`watchPosition` は 10m/3秒間隔なので、実運用でこの上限には届かない（10,000点 ≒ 100km）。
- **`/walks` は `/explore/*` のレート制限バケット対象外**（`walks/router.py` に `enforce_explore_rate_limit` が無い）。終了時のリトライで 429 を気にしなくてよい。
- **履歴の queryKey は `["walks", ...]` 始まり**で統一する（保存成功時の `invalidateQueries` がこのプレフィックスを使う）。
- 一覧 `WalkRead` は軌跡を含まない。軌跡は `GET /walks/{walk_id}`（`WalkDetailRead`）のみ → **一覧行にミニ地図は出せない**（サムネイルが欲しくなったら backend に代表点/bounds の追加を依頼する）。
- `GET /walks` は keyset カーソル（`next_cursor: string | null`、`limit` 1..50・既定20）。不正カーソルは 400。**`cursor` を明示的に `null` で送ると 400 になる**（[[mobile-structure]] の Orval 落とし穴1）。
- `useFinishedWalkStore.savedWalkId` は SS-19 時点でプロダクトコード未参照。SS-20 の「サマリ → その散歩の詳細」遷移で消費される想定（ADR-008 決定4）。

Related: [[project-explore-api-contract]], [[mobile-structure]]

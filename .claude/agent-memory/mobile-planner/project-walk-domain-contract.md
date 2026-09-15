---
name: project-walk-domain-contract
description: How backend /walks maps onto mobile's active-walk state — the values that are NOT interchangeable and where the idempotency key is minted
metadata:
  type: project
  scope: durable
  adr: packages/mobile/adr/ADR-008-active-walk-state-and-route-cache.md
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

## 削除 API（SS-53 backend / SS-60 mobile 導線）

- `DELETE /walks/{walk_id}` は **204 / 冪等ではない**（削除済み・他人・存在しない ID はすべて 404）。
  ADR-003 決定13 が「クライアントは 404 を成功同様に扱ってよい」と明言している。
  → mobile の API ラッパ側で 404 を成功に読み替えるのが正解（msw でテストできる層に閉じる）。
  ただし**非 UUID の入口ガードだけは 404 にしない**（`fetchWalkDetail` は 404 を使っている）。
  404 を成功に読み替える関数で 404 を投げると「失敗しているのに成功」になる → 422 を使う。
- **物理削除なので `(user_id, client_walk_id)` の UNIQUE が解放される**。同じ `client_walk_id` を
  再送すると散歩が復活する。ADR-003 決定13 が mobile に「削除後にドラフト／client_walk_id を
  保持し続けないこと」を要求している（＝ `useFinishedWalkStore` を `savedWalkId` 一致時にクリアする）。
- **`invalidateQueries({queryKey:["walks"]})` はマウント中の詳細 query も再取得させる**。
  削除直後に呼ぶと自分が消した記録に 404 を引き、遷移する直前に「見つかりませんでした」が一瞬出る。
  → 画面の表示状態を決める純粋関数で「削除済み」をエラーより優先させて覆い隠す。
  `useWalkDetail` は `staleTime 1h / gcTime 2h` なので、`removeQueries(["walks","detail",id])` も併せて呼ぶ。

## 散歩中ルートまわりで毎回引っかかる制約（SS-33 時点）

**SS-33 で「散歩中のルート再計算」「往路/復路の到達判定」を両方とも撤去した**（ADR-008 決定7 撤回・
決定9 新設）。以下は SS-33 時点で有効な制約。SS-35 時点の再計算前提（現在地起点で引き直す、
`isOffRoute` 判定など）はもう存在しない。

- **ルートの取得は ADR-008 決定2 で「`origin` = 散歩の起点で固定」**（**例外なし**）。散歩開始画面と
  散歩中画面が同じ `useWalkRoute({origin, destination})` を呼んで queryKey を一致させ、API 1回
  （1散歩あたり生涯で1回。散歩中の呼び出しは0回）で済ませるのが設計の主目的。
- `useWalkRoute` は `staleTime 1h / gcTime 2h / retry:false`。再計算が無くなったため
  `keepPreviousData` を避ける理由（queryKeyを動かすと表示中のルートが消える問題）はそもそも発生しない。
- `useMapRouteFit`（`lib/walkRoute.ts` の `walkRouteFitKey`）の依存は **`origin`/`placeId` の組**。
  `legs`（往路/復路の区別）は見ない。地図のフィット範囲は起点と目的地だけで決まり、
  周回ルートの区間の区別を必要としないため。
- `buildWalkingRouteRequest`（`lib/walkRouteRequest.ts`）が origin を小数4桁に丸め、placeId 空文字を
  null にし、目的地名を Unicode 切り詰めする。この規律は継続。
- **`WalkRoute` はもう片道値を持たない**。`legs: [outbound, return]` + `returnIsSamePath` になり、
  `duration_seconds`/`distance_meters` の意味は「片道」から「周回全体（往路+復路の合計）」に変わった。
  画面の「片道◯分」表記は撤去済み（`ActiveWalk.loopMinutes`/`loopKm` が周回全体の目安を表示する）。
  往路/復路の描き分けは `lib/walkRouteLegs.ts` の純粋関数（`walkRoutePolylineSegments`/
  `walkRouteLegendItems`）が担い、判定（現在どちらの区間にいるか）は行わない。
- SS-35 時点にあった「`services/location` の mock 軌跡でルート逸脱を屋内から再現する」知見は、
  逸脱判定そのものが撤去されたため不要になった（削除）。

Related: [[project-explore-api-contract]], [[mobile-structure]]

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

## 散歩中ルートまわりで毎回引っかかる制約（SS-35 の調査）

- **ルートの取得は ADR-008 決定2 で「`origin` = 散歩の起点で固定」**。散歩開始画面と散歩中画面が同じ
  `useWalkRoute({origin, destination})` を呼んで queryKey を一致させ、API 1回で済ませるのが設計の主目的。
  **現在地でルートを引き直す提案は決定2 の例外**にあたり、ADR-008 の追補が要る（AGENTS.md の規約）。
- `useWalkRoute` は `staleTime 1h / gcTime 2h / retry:false`、かつ **`keepPreviousData` を意図的に使わない**。
  → queryKey（origin）を動かす設計にすると、取得中・失敗時に `data` が `undefined` に落ちて
  **表示中のルートが消える**。「失敗しても直前のルートを保つ」要件とは両立しない。
- `useMapRouteFit` の依存は **`walkRoute?.destination.placeId` だけ**。目的地が同じままルートだけ
  差し替わるケース（起点変更・周回ルート）では**地図が再フィットしない**。キーを変える必要がある。
- `buildWalkingRouteRequest`（`lib/walkRouteRequest.ts`）が origin を小数4桁に丸め、placeId 空文字を
  null にし、目的地名を Unicode 切り詰めする。新しいルート取得経路でも必ずこれを通す。
- `WalkRoute.duration/distance` は片道値。現在地起点で引き直すと意味が「残り」に変わるため、
  画面の「片道◯分」表記をそのまま使い回さない。
- `services/location` の mock 軌跡（`MOCK_TRACK`）は東京駅から**北東**へ 40m × 10点。
  `DEFAULT_ACTIVE_WALK` の目的地は**北西**約900m。→ /dev-screens の「散歩中」は
  「ルートから外れていく」状況を屋外に出ずに再現できる（ただし placeId が `stub-default-goal` なので
  実 API は失敗する＝失敗系UIの確認向け）。

Related: [[project-explore-api-contract]], [[mobile-structure]]

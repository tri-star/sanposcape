---
name: local-state-recalc-over-query-pattern
description: 入力が変わるたびにqueryKeyが変わり直前データが消えるのを避けたいとき、TanStack Queryではなくhookのローカルstate + AbortController + 単調増加sequenceで持つパターン（SS-35 useWalkRouteRecalculation）
metadata:
  type: project
---

SS-35（散歩開始後の現在地起点ルート再計算）で確立したパターン。`useWalkRoute`（`useQuery`）は
`origin`/`destination` が変わると queryKey が変わり、pending・error 中は `data` が
`undefined` に落ちる。「取得中・失敗時も直前の正常データを表示し続けたい」要件では
`placeholderData: keepPreviousData` は pending 中しか効かず error 状態を救えないため、
**Query を経由しない別経路**として hook のローカル `useState` に持つ設計を採った。

- 状態機械は `lib/` の純粋関数（`beginRecalculation` / `applyRecalculationSuccess` /
  `applyRecalculationFailure` 等）に閉じ、hook 側は "副作用の実行係" に徹する
  （`src/features/walk/lib/routeRecalculation.ts` / `hooks/useWalkRouteRecalculation.ts`）。
- **多重起動の二重防御**: (1) 状態機械側の `status === "recalculating"` ガード、
  (2) `AbortController` + hook の `useRef` が持つ単調増加 `sequence`（リセットしても
  巻き戻さない）で古い応答を破棄。どちらか一方だけでは不十分（(1) だけだとリセット後に
  遅延到着した応答を防げず、(2) だけだと無駄なリクエストが飛ぶ）。
- effect の依存配列は「トリガとなる1値だけ」（このケースでは `currentPosition`）に絞り、
  他の最新値（`paused`・ルート・destination など）は render 時に直接代入する ref 経由で読む
  （`useWalkTracking.pausedRef` と同じ手法）。依存を広げると同じ入力で判定が二重に走る。
- 表示すべき実効値は `state.localValue ?? baseValueFromQuery` の合成で作る。初期値は
  従来どおり Query のキャッシュ共有を維持しつつ、再計算後の値だけ別経路にする。

**Why:** キャッシュを完全に手動化すると自前でエラー・ローディング管理をやり直すことになるが、
「初期値は Query 共有、更新後の値だけローカル state」と役割分担すると、Query の恩恵
（初期ロードのキャッシュ共有・429対策）を失わずに「直前データを消さない」要件を満たせる。

**How to apply:** 同種の要件（入力変化でqueryKeyが変わると困る／pending・error中も
前回成功データを見せたい）が出たら、この二層構成（Query = 初期値、hookローカルstate = 更新後
の値、状態遷移は `lib/` の純粋関数）を検討する。判定ロジックは必ず `lib/` に置き、
`hooks/` には分岐を増やさない（[[test-scope-hooks-components]]）。

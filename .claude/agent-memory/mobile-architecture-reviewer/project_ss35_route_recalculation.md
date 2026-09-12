---
name: project_ss35_route_recalculation
description: SS-35 散歩開始後の現在地起点ルート再計算（Query外ローカルstate・sequence世代管理・純粋関数状態機械）のレビュー知見
metadata:
  type: project
---
> **2026-08-23 更新（SS-33 動作確認）**: **自動再計算は廃止された**。散歩開始時に往路・復路の
> ルートを固定し、引き直しは地図右上の「ルートを再計算」ボタン（`walk-active-route-recalc`）を
> 押したときだけ走る。`lib/routeDeviation.ts` の `isOffRoute` / `ROUTE_DEVIATION_THRESHOLD_METERS`、
> `lib/routeRecalculation.ts` の `observeRoutePosition` / `shouldStartRecalculation` と
> レート抑制の状態（`offRouteCount` / `lastRequestAtMs` / `consecutiveFailures`）は削除済み。
> 以下の記述のうち**自動トリガとレート抑制に関する部分は現存しない**。多重起動防御のうち
> 生き残っているのは `sequence` の世代管理と `status === "recalculating"` のガードのみ。
> 経緯は mobile ADR-008 決定7 の「SS-33 動作確認 追補」を参照。


SS-35（`tri-star/ss-35` ブランチ）は「散歩中に現在地がルートから逸脱したら現在地起点で再計算する」機能。
`tmp/SS-35/mobile-plan.md` に極めて詳細な設計（しきい値の根拠、状態機械の仕様、effect依存配列の設計理由まで）があり、
実装（9コミット）はプランを忠実に踏襲していた。差分は見つからず、参照実装として質が高い。

**採用されたパターン（今後の参照に有用）**:
- サーバー由来データを「取得中/失敗時も直前の値を表示し続けたい」場合、TanStack Query を使わず
  hookのローカル state + 純粋関数の状態機械（`lib/routeRecalculation.ts`）+ `AbortController` + 単調増加 `sequence` で
  古い応答を破棄する設計。ADR-008 決定7として追補。`useQuery` の `placeholderData: keepPreviousData` は
  pending中のみ効き、error状態を救えないためQueryを避ける、という判断理由が明記されている。
- 判定ロジック（逸脱判定・状態遷移・通知種別選択）を徹底して `lib/` の純粋関数に寄せ、
  `hooks/` `components/` にはほぼ分岐を置かない設計（vitestが `src/**/*.test.ts` のみ対象という制約への対応）。
- effect依存配列を意図的に絞り（`[currentPosition]` のみ）、他の値（paused, activeWalk, route）は
  ref経由で読む手法。`useWalkTracking` の既存 `pausedRef` パターンを踏襲。1測位=1回評価が保証される理由は
  「`watchPosition` が毎回新しいオブジェクトを返すため参照比較で変化を検知できる」こと。
- 手動再計算（ボタン）は自動トリガの抑制条件（最小間隔・連続失敗上限）を意図的にバイパスする設計。

**軽微な指摘（P3程度、実害小）**:
- `WalkRouteNotice.tsx` の `recalc_failed` 表示では非retriableエラー時に再試行ボタンを隠すが、
  地図ツールの「ルートを再計算」`IconButton`（`WalkActiveView.tsx`）は `canRecalculateRoute` と
  `recalculating` 状態のみで disabled 判定しており、非retriableエラー後でも押せてしまう
  （`recalculate()` が `shouldStartRecalculation` の分類ガードを経由せず直接 `start()` を呼ぶため）。
  UI上の「再試行を隠す」意図と、別導線（地図ボタン）から結局呼べてしまう点がわずかに非対称。
  プラン上は「手動は全抑制条件をバイパスする」と明記されているため意図的な設計であり、バグではない。

参照ファイル: `packages/mobile/src/features/walk/lib/{routeDeviation,routeRecalculation,walkRouteNotice}.ts`、
`packages/mobile/src/features/walk/hooks/useWalkRouteRecalculation.ts`、
`packages/mobile/adr/ADR-008-active-walk-state-and-route-cache.md`（決定7）。

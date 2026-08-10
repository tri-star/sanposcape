---
name: project_ss42_history_stats
description: SS-42（記録タブの週/月集計・連続日数・歩数を GET /walks/stats の実データへ差し替え）レビュー時点の実装状況
type: project
---

`tmp/ss-42/mobile-plan.md`（backend への API 依頼を含む詳細プラン）に基づき、
`src/features/history/{api/walkStatsApi.ts, lib/{periodChart,periodChartLabel,stepEstimate,
walkStatsError}.ts, data/stepGoal.ts, hooks/useHistorySummary.ts, components/{HistoryView,
PeriodChart,StepGoalCard}.tsx}` が実装され、`data/records.ts`（静的スタブ）が削除された
（2026-08-09時点でレビュー、対象コミット `f170371`。backend 側は `49effbf`、
`docs/adr/ADR-003-walk-record-persistence-and-history-api.md` に SS-42 追補済み）。

**確認できた良好パターン（今後のレビューでも踏襲を期待してよい）:**
- `api/walkStatsApi.ts` は `walkHistoryApi.ts`（`fetchWalkList`/`fetchWalkDetail`）と寸分違わぬ
  構造（素の fetcher・生成 hook 不使用・`ApiError` 正規化・`services/auth` 非 import）を踏襲。
  テスト（`walkStatsApi.test.ts`）も msw ハンドラの使い方まで既存 `walkHistoryApi.test.ts` と揃えてある。
- `useHistorySummary`（hook）は本当に配線のみ。ロジック（`buildPeriodChart` / `estimateSteps` /
  `toWalkStatsErrorCode`）はすべて `lib/` の純粋関数に切り出され、Vitest で境界値まで検証されている
  （UTC深夜パースずれ対策の `Date.UTC`+`getUTCDay()`、四捨五入境界、負値/非有限値ガード等）。
- queryKey 設計: `useHistorySummary` は `["walks","stats"]`、`useWalkHistory` は
  `["walks","list",{limit}]`。`useWalkSave` の `invalidateQueries({queryKey:["walks"]})`
  （`src/features/walk/hooks/useWalkSave.ts:51`）がどちらのプレフィックスにも一致するため、
  散歩保存後に記録タブの集計と一覧が両方自動更新される。状態の二重管理は無い
  （`data/stepGoal.ts` はローカル UI 定数でありサーバー状態と競合しない）。
- `lib/walkStatsError.ts` を `walkHistoryError.ts` から独立させた判断は妥当。`/walks/stats` は
  400/404 を返さない設計（クエリパラメータ・カーソル無し）のため、コード体系を分けている
  （`walkSaveError.ts`/`walkHistoryError.ts` と同じ既存方針の踏襲。**単なる重複ではない**）。
  `isApiError`+`status>=500`+`TypeError`判定のボイラープレート自体は
  `exploreError.ts`/`walkSaveError.ts`/`walkHistoryError.ts`/`walkStatsError.ts` の4ファイルに
  分散しているが、これはこのプロジェクトで意図的に繰り返されている既存パターンであり、
  新規に指摘するほどの重複ではない（共有ヘルパー化するとドメインごとの status セットの違いが
  埋もれるため、あえて分けている）。
- `data/stepGoal.ts` はスタブであることをコメントで明示し、参照元を `useHistorySummary.ts` の
  1箇所に限定（grep で確認済み、View から `data/` を直接 import していない）。
- `records.ts`/`records.test.ts` 削除後、`grep -rn "data/records\|RECORDS_BY_PERIOD\|TODAY_INDEX\|
  STREAK_DAYS\|TODAY_STEPS"` はテスト内コメント1件を除き0件（死んだ参照なし）。

**既知の残課題（Warning相当、次の関連PRで確認すること）:**
- `docs/milestones.md`（リポジトリルート）の M5 セクション（150行目台・163〜164行目付近）が
  「記録タブの集計表示は `useHistorySummary` のスタブのまま」「歩数目標はスタブのままで実データ化は
  別課題」という SS-20 時点の記述のまま更新されていない。`tmp/ss-42/mobile-plan.md` §4 の
  「リポジトリルート側」表は `docs/milestones.md [確認] # 記録タブのスタブ留保の記述を実績へ更新」を
  明記していたが、反映されていない（`docs/adr/ADR-003` 側の SS-42 追補は正しく反映済み）。

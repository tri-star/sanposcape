---
name: project_ss42_walk_stats
description: SS-42 記録タブ集計実データ化(GET /walks/stats)のセキュリティレビュー要点
type: project
---

SS-42（commit f170371, mobile / 49effbf, backend）は記録タブの週/月チャート・連続日数・推定歩数を
`GET /walks/stats`（認証必須、クエリパラメータなし）の実データに差し替えた。レビュー結果は問題なし
（Critical/High/Medium/Low 指摘なし）。

- `fetchWalkStats`（`features/history/api/walkStatsApi.ts`）は Orval 生成 fetcher
  `getWalkStatsWalksStatsGet` を呼ぶだけで、生 `fetch` は使っていない。トークン付与・401→refresh→
  1回リトライは `src/api/client.ts` の `customFetch`（[[project_ss19_walk_finish_save]] 等これまでの
  レビューと同じ既存パターン）に一元化されており、`services/auth` を直接 import しない設計を維持。
- エラー分類は `walkStatsError.ts`（`toWalkStatsErrorCode` / `walkStatsErrorMessage`）で、
  ユーザー向けメッセージは固定文言のみ。サーバーの生エラー本文・スタックトレース・トークンは
  一切露出しない。`console.*` によるログ出力も無し。
- `WalkStatsRead` 系のレスポンス型（`today` / `week` / `month` / `streak_days` 等）に内部ID・
  PII に相当するフィールドは含まれない。
- `.maestro/mvp-walk-flow.yaml` の追加ステップは `history-stats-loading` / `history-stats-error`
  の testID 待機のみで、認証情報のハードコードなし。
- 生成物 `src/api/generated/` はこのコミットで一切変更されていない（`getWalkStatsWalksStatsGet` は
  事前の生成ステップで追加済みのものをそのまま利用）。手編集の痕跡なし。
- 歩数はサーバーが値を持たず、クライアント側で `distance_meters / 0.7` として推定表示。UI 見出しを
  「今日の推定歩数」とし注記も付けて実測値との誤認を防ぐ設計（セキュリティというよりUX配慮だが、
  情報の正確性という観点で妥当と判断）。

**How to apply**: 今後 `features/history/` や新規 `GET` 系読み取り専用APIをレビューする際、
`customFetch`経由か・エラーメッセージが定型文言に留まっているか・生成物を手編集していないかの
3点は今回同様に最初に確認すると効率的。

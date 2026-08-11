---
name: screens-and-stub-layer
description: MVP 画面 → View → データ供給の対応、data/ 層の現在の役割（API スタブは解消済み）、表示確認ルート
metadata:
  type: project
---

SS-8 で MVP 主要画面が静的実装され、その後 SS-11/15/16/19/20/42 で実 API へ移行済み。画面の構造は安定。

## 画面 → View → データ供給（2026-08 時点）
`app/`(薄いルート) → `src/features/<f>/components/<PascalCase>View` の1対1。ルートは View を返すだけ
（`rg "Store" packages/mobile/app` が 0 件＝**ルートは store を読まない**のが現状の慣行。ここを崩す変更は理由を書く）。
- `app/index.tsx` → `auth/SplashView` / `(auth)/sign-in|sign-up` → `auth/SignInView|SignUpView`
- `walk-start` → `walk/WalkStartView`（`useWalkPlan` → `useCurrentLocation`＋`useSpotCandidates`(explore API)＋`useWalkRoute`）
- `(tabs)/index` → `walk/WalkActiveView`（`useActiveWalkStore`＋`useWalkSession`）
- `walk-summary` → `walk/WalkSummaryView`（`useWalkSummary`＋`useWalkSave` → `POST /walks`）
- `(tabs)/history` → `history/HistoryView`（`useHistorySummary` → `GET /walks/stats`、`RecentWalksSection` → `GET /walks`）
- `walk-history/[walkId]` → 履歴詳細（`GET /walks/{id}`）
- `design-system` / `dev-screens` → `DesignSystemGallery` / `ScreenCatalog`（開発ルート。プロダクト導線外）

## `data/` 層の現在の役割（**API スタブの置き場ではなくなった**）
`spots.ts` / `records.ts` は削除済み。残るのは3本だけで、いずれも API 化対象ではない:
- `walk/data/categories.ts`: `ExploreCategory` enum に対する表示メタ（ラベル/アイコン/地図色キー）と選択肢一覧・既定値
- `walk/data/defaults.ts`: `/dev-screens` から各画面を単独表示するための代表値（`buildSampleFinishedWalk` は実際に保存が走る）
- `history/data/stepGoal.ts`: 目標歩数。**backend に対応 API が存在しない**ため残置
`data/` は type-only import のみ＝node の `.test.ts` から読める。各ファイルに不変条件テストが併置されている。

## 表示確認の担保（RN render テスト不可の代替）
「純粋関数での整形・文言テスト（自動）」＋「`/dev-screens` の `ScreenCatalog` からの目視（手動）」の二段。
表示文言は View でテンプレートリテラルを組まず `features/<f>/lib/*.ts` の純粋関数で確定させるのが既存方針。

## msw は使う（旧メモの訂正）
`src/test/setup.ts` が `setupServer({onUnhandledRequest:"error"})` を起動し、ネットワークを叩く全モジュール
（`api/client.ts`、`features/*/api/*.ts`）が Orval 生成ハンドラ（`endpoints/*/**.msw.ts`）でテストされている。
詳細は [[feedback-mobile-testing-reality]]。

---
name: screens-and-stub-layer
description: SS-8 で入った MVP 画面一覧・スタブデータ層の場所・開発確認ルート・msw 不整合
metadata:
  type: project
---

SS-8 で MVP 主要画面が静的実装済み（`feat/ss-8-mvp-screens`）。各画面の構造は安定。

## 画面 → View → データ供給
`app/`(薄いルート) → `src/features/<f>/components/<PascalCase>View` の1対1。
- `app/index.tsx` → `auth/SplashView`(900ms後 `/(auth)/sign-in` へ自動遷移)
- `(auth)/sign-in|sign-up` → `auth/SignInView|SignUpView`（`useAuthActions`＋`services/auth` stub。real は意図 throw）
- `walk-start` → `walk/WalkStartView`（`useWalkPlan` → `walk/data/spots.ts`）
- `(tabs)/index` → `walk/WalkActiveView`（router params＋`useWalkSession` タイマー＋`lib/walkStats`）
- `walk-summary` → `walk/WalkSummaryView`（router params。`toNonNegInt` で非有限値ガード＝コミット 1a7922a）
- `(tabs)/history` → `history/HistoryView`（`history/data/records.ts`＋`lib/periodChart`）
- `(tabs)/search` → `search/SearchPlaceholderView`（ピン検索は別タスク。準備中プレースホルダ）
- `design-system` → `design-system/DesignSystemGallery`（プリミティブ確認用の**開発ルート**。プロダクト導線外）

## スタブデータ層の置き場
`src/features/<feature>/data/*.ts` が静的スタブの正。**type-only import のみ**（`react-native` を値 import しない）なので
node 環境の `.test.ts` から読める（`spots.ts`/`records.ts` がこの形）。
将来 `features/<f>/api/`＋Orval＋TanStack Query へ差し替える seam＝**View は hook 経由でのみ data を参照**する
（`useWalkPlan` がその形。`HistoryView` は SS-9 時点では data を直接参照していた＝要 hook 化の候補）。

## 表示確認の担保（RN render テスト不可の代替）
render/snapshot テストは書けない（[[mobile-test-and-styling-constraints]]）ため、表示確認は
「純粋関数での data 整合性テスト（自動）」＋「開発ルートでの実機目視（手動）」の二段。
既存の目視ルートは `app/design-system.tsx` のみ（プリミティブ）。画面カタログは SS-9 で追加提案。

## msw 不整合（既存・要注意）
`src/test/setup.ts` が `msw/node` の `setupServer()` を起動しているが、現存テストは全て純粋関数で msw 未使用。
プロジェクト方針（単体の Backend API モックは Orval スタブ、**msw 不使用**）と食い違う既存設定。
API を扱わないタスクではスコープ外として触らない。API 連携タスク着手時に撤去/方針確定する申し送り扱い。

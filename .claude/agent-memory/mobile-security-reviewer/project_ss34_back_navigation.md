---
name: project_ss34_back_navigation
description: SS-34 散歩開始/履歴一覧/履歴詳細の「戻る」導線一元化(useScreenBack)レビュー。fallbackHrefは全て呼び出し元でハードコードされたリテラルでopen redirect余地なし
type: project
---

`packages/mobile/src/hooks/useScreenBack.ts`（BackHandler購読+router.back()/replace一本化）と
`packages/mobile/src/lib/backNavigation.ts`（`resolveBackAction` 純粋関数、優先順位:
intercepted > navigating > canGoBack > replace-fallback）を新規導入。呼び出し箇所は3箇所:
`WalkStartView`（`fallbackHref: "/(tabs)"`）、`WalkHistoryListView` / `WalkDetailView`
（いずれも `fallbackHref: "/(tabs)/history"`）。

**Why 安全と判断したか:** `fallbackHref` は3箇所とも呼び出し元コードにハードコードされた
リテラル文字列で、`useLocalSearchParams` や `next=`/`redirect=` 等のクエリ由来の値を一切
経由しない。ディープリンクで `walk-history/[walkId]` に直接遷移しても `canGoBack()` が
false になり `fallbackHref` へ固定 replace されるだけで、任意遷移・オープンリダイレクトは
成立しない。また `WalkStartView` の状態（`useWalkPlan` の `useState`）も
`useActiveWalkStore`/`useFinishedWalkStore` 同様に非永続（メモリのみ）で、戻る操作自体は
`startWalk()` を呼ばないため、離脱時に機密状態が残る経路もない。

**How to apply:** 今後 `useScreenBack` の呼び出し箇所が増えるたびに、`fallbackHref` が
動的（route params / API レスポンス由来）に変わっていないかだけ確認すればよい
（ハードコードのままなら再監査不要）。**2026-08-06 追記**: [[project_dev_only_routes_no_guard]]
（app/ 配下の大半のルートに認証ガードがない、SS-15時点）は SS-13 の `AuthGate` 導入
（[[project_ss13_auth_gate]]）で解消済み。`useScreenBack` 呼び出し全画面（`WalkStartView` /
`WalkHistoryListView` / `WalkDetailView`）はいずれも `AuthGate` の保護ルート判定
（`canEnterProtectedRoutes`）の対象に含まれることを確認済み。
E2E (`packages/mobile/.maestro/walk-start-back.yaml`) は `subflows/sign-in.yaml` 経由で
testID タップのみを使い、認証情報のハードコードなし（`EXPO_PUBLIC_AUTH_MODE=dev` 依存、
既存パターンと同様）。

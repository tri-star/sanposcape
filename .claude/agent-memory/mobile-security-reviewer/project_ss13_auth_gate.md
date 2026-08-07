---
name: project_ss13_auth_gate
description: SS-13で認証ゲート(AuthGate)導入。以前指摘していたグローバルガード不在(project_dev_only_routes_no_guard)は解消
type: project
---

**2026-08-06 SS-13 レビューで確認**: `app/_layout.tsx` の `AuthGate`
（`src/features/auth/components/AuthGate.tsx`）が `<Stack>` を包み、`resolveAuthGateDecision`
（`src/features/auth/lib/authGate.ts`）が `useSegments()[0]` を `PUBLIC_ROOT_SEGMENTS`
（`(auth)` / `dev-screens` / `design-system` / `_sitemap`）と照合、それ以外は
`canEnterProtectedRoutes(status) === (status === "authenticated")` でないと
`/(auth)/sign-in` へ `router.replace`。これにより [[project_dev_only_routes_no_guard]]
（`walk-start` / `(tabs)` / `walk-history` / `settings` 等にガードが無かった問題）は解消された。
oxlint override（`features/walk|history` → `@/services/auth` / `@/store/useAuthSessionStore` 禁止）
も実際に発火することを確認済み（プローブファイルで検証）。

**認証状態は `src/store/useAuthSessionStore.ts`（`loading|authenticated|guest`）に一本化**。
書き込み経路は `services/auth/index.ts` の `onSessionChange` 配線と `useAuthSessionBootstrap`
の2つのみ。`SettingsView` の自前ガード・自前 `runSessionCleanup()` 呼び出しは削除され、
後始末の実行側は `setSession()` の `authenticated → guest` 遷移に一本化（ADR-008 決定6 追補）。
これにより非自発的セッション失効（refresh 401）でも `runSessionCleanup()` が走るようになった。

**残存する軽微な論点（Low、意図的な受容リスクとして ADR-009 に明記済み）**:
- `status === "loading"` の間はゲートが素通しする設計。ディープリンクのコールドスタートで
  保護画面が復元完了までの数百 ms 描画されうるが、機微データはサーバー由来でトークンが
  無ければ 401 になるため実害は小さいと ADR 自身が評価している。同意できる評価。
- `_sitemap`（expo-router 標準のデバッグ用ルート一覧）は `app.json` で無効化しておらず
  本番ビルドにも含まれる。中身はルート一覧へのリンクのみで実データは含まないため実害は低いが、
  `sitemap: false` を config plugin に足せば完全に閉じられる（未対応、nits 相当）。
- `initAuth()` の JSDoc「セッション復元は呼び出し側の責務（SS-11 のスプラッシュ）」が
  実装（`useAuthSessionBootstrap`/`AuthGate`に移動済み）と乖離した古い記述のまま
  （`src/services/auth/index.ts:63`）。nits。

**How to apply**: 今後 mobile 全体監査や新規ルート追加のレビューでは、まず
`PUBLIC_ROOT_SEGMENTS` に新規ルートの先頭セグメントが誤って追加されていないか、
新規ルートが `app/` 直下に増えた場合に `canEnterProtectedRoutes` 経由で保護されるか
（`AuthGate` は `<Stack>` 全体を包むので新規ルート追加だけなら自動的に保護される）を確認する。
`services/auth` バレルを import している UI コンポーネントが増えていないか
（`getCurrentUser()` の UI 直接呼び出し禁止規約）も合わせて確認する。

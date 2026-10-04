---
name: auth-gate-review-checklist
description: 認証ゲート(AuthGate)・ゲスト解禁・戻る導線(useScreenBack)まわりのセキュリティレビュー観点(SS-13/SS-57/SS-34のレビュー結果を統合)。新規ルート追加・PUBLIC_ROOT_SEGMENTS・fallbackHref・セッション終了時の後始末順序
metadata:
  type: feedback
  scope: durable
  adr: packages/mobile/adr/ADR-M-009-auth-session-state-and-route-gate.md
---

設計判断の正本は `packages/mobile/adr/ADR-M-009-auth-session-state-and-route-gate.md`
（AuthGate・`PUBLIC_ROOT_SEGMENTS`・ゲスト解禁（SS-57 追補）・`_sitemap` の許容）と
`packages/mobile/adr/ADR-M-008-active-walk-state-and-route-cache.md` 決定6（sessionCleanup）。

## 現状の構造（2026-10 時点）

- `app/_layout.tsx` の `AuthGate` が `<Stack>` 全体を包み、`resolveAuthGateDecision`
  （`src/features/auth/lib/authGate.ts`）が `useSegments()[0]` を `PUBLIC_ROOT_SEGMENTS`
  （`(auth)` / `dev-screens` / `design-system` / `_sitemap`）と照合する。それ以外は
  `canEnterProtectedRoutes(status)` に従う。SS-57 以降は guest も許可されるため、現状
  ゲートが redirect を返す経路は無い（判定の器は ADR-M-009 決定3 のため残している）。
- `_sitemap` は本番にも含まれるが ADR-M-009 で許容済み（中身はルート一覧のみ）。再指摘しない。
- 認証状態は `src/store/useAuthSessionStore.ts`（`loading|authenticated|guest`）に一本化。
  書き込みは `services/auth/index.ts` の `onSessionChange` 配線と `useAuthSessionBootstrap` のみ。
- `setSession()` は `authenticated → guest` のときだけ `runSessionCleanup()` を**同期的に**呼ぶ。
  退避の effect より前に後始末が走るため、前ユーザーのキャッシュ・位置情報が残る窓は無い。
  退避は `shouldEvacuateOnSessionEnd`（状態遷移ベース）で純粋関数化・テスト済み。
- guest の 401 は `hadToken: false` なので refresh を試みない（`src/api/retryPolicy.ts`）。

## レビュー時に確認すること

1. `PUBLIC_ROOT_SEGMENTS` に新規ルートの先頭セグメントが誤って追加されていないか。
   `app/` 直下への新規ルート追加だけなら `AuthGate` が自動的に保護対象にする。
2. 認証必須の機能は「ルートに入れるか」ではなく画面・通信側（`enabled: isSignedIn` 等）で
   ゲストを止めているか（ゲストは保護ルートに入れる前提）。
3. UI コンポーネントが `services/auth` バレルを import していないか（`getCurrentUser()` の UI 直接呼び出し禁止）。
   ゲスト時に `user`（PII）を読まず `status` だけを読んでいるか（`SettingsView` が模範）。
4. `useScreenBack` の `fallbackHref` が呼び出し元のハードコードされたリテラルのままか。route params・
   クエリ（`next=` / `redirect=`）・API 応答由来の値になったらオープンリダイレクトを疑う。
   ハードコードのままなら再監査不要。
5. 戻る操作で `useActiveWalkStore.endWalk()` 等の進行中データ破棄を呼んでいないか。
6. `useAuthSessionStore` 自身が `registerSessionCleanup()` に登録されていないか。

## 既知の受容済み Low（再指摘しない）

- `status === "loading"` の間はゲートが素通し（コールドスタートのディープリンクで保護画面が
  数百 ms 描画されうるが、データはサーバー由来でトークン無しなら 401。ADR-M-009 で受容）。

---
name: project_ss13_auth_session_gate
description: SS-13 認証状態集約(useAuthSessionStore)+AuthGate実装レビューの所見。良好な依存方向設計と、docドリフト/サーバーデータ混入という残課題
type: project
---

SS-13（ブランチ `feat/ss-13-auth-walk-separation`）で `src/store/useAuthSessionStore.ts`
（`loading|authenticated|guest`）+ `app/_layout.tsx` の `AuthGate`（判定は
`features/auth/lib/authGate.ts` の `resolveAuthGateDecision`/`canEnterProtectedRoutes` に純粋関数化）
を導入。ADR-009 新規作成、ADR-008 決定6（`runSessionCleanup()` の実行側）を追補。

**良好な点**:
- 依存の向き: `store/useAuthSessionStore.ts` は `@/services/auth/types` から `AuthUser` を
  `import type` のみで取得し、`@/services/auth`（バレル）を実行時 import しない
  （node環境vitestが壊れるのを回避）。逆方向（`services/auth/index.ts` → store）は許可、
  という非対称ルールが明確に守られている。
- `AuthGate` は `useEffect` の依存に `segments`（配列、同一性が変わりうる）ではなく
  `redirectHref: string | null` を置いて redirect 連打を防止。`children` を条件分岐で
  差し替えない（`<Stack>` 再マウント回避）。
- `useAuthSessionBootstrap` はモジュールスコープのラッチで StrictMode 二重実行を防ぎ、
  cleanup で abort しない（loading 永久化を回避）という判断が明示コメント付きで正しい。
- ゲート判定12ケースが `authGate.test.ts` にテーブル形式で網羅されている。
- `dev-screens` / `design-system` を authGate 上は「公開ルート」扱いにしているが、
  実際は各route側で `if (!__DEV__) return <Redirect href="/" />` により本番到達不可なので
  二重の安全網になっており矛盾はない。

**残課題（指摘済み・要フォロー）**:
1. `src/lib/sessionCleanup.ts` の `runSessionCleanup()` JSDoc が
   「呼び出し側は現状 `SettingsView`」のまま古い。ADR-008 決定6追補で実行側は
   `useAuthSessionStore.setSession()` に移ったが、このファイルは SS-13 実装プランの
   編集対象リストに含まれておらず更新されなかった（ドキュメントドリフト。
   [[project_ss19_walk_finish]] の savedWalkId コメント陳腐化と同種のパターン）。
2. `useAuthSessionStore.user: AuthUser`（id/email/displayName/photoUrl、
   `/auth/session`・`/auth/refresh` 由来）は `src/store/` に置かれているが、
   `folder-structure.md` の「`src/store/` はサーバー由来のデータを置かない」原則との
   関係が ADR-009 で明示的に整理されていない。ADR-008 の `savedWalkId` は
   「識別子1つだけ」と例外の範囲を明記して正当化しているのに対し、こちらは
   `AuthUser` オブジェクト全体を保持しており対称的な扱いがない。現時点で `user` を
   読むコンポーネントも存在しない（`status` のみ購読されている）ため、
   「セッションと1:1で変わる identity snapshot は Query の対象外」という論法を
   ADR に足すか、使われるまで持たない方が筋が良い。
3. サインアウト時、`AuthGate`（zustand の `status` 変化で再レンダー→`useEffect`で
   `router.replace`）と `SettingsView`（`signOut().finally()` で
   `dismissAll()+replace()`）が競合しうる。ADR/プランは「ゲートの effect が走る頃には
   既に (auth) にいる」と主張しているが、これは microtask（`.finally`）と
   macrotask 相当（`useEffect` 発火）の順序という暗黙の JS スケジューリング前提に
   依存しており、フレームワーク側の保証ではない。実害は恐らく無害な二重 replace 程度だが、
   明示的な検証（コメントでの前提明記や `logout.yaml` での navigator 状態アサート）が
   薄い。

**2026-08-06 追記（レビュー対応で解決済み）**: 上記「残課題」3点はいずれもレビュー対応ブランチで解消。
1は `sessionCleanup.ts` の JSDoc を実行側（`useAuthSessionStore.setSession()`）に更新（[[callback-caller-jsdoc-drift]]）。
2は ADR-009 に「`user` はセッションのライフサイクルと1:1の identity snapshot」として例外を明記し、
`folder-structure.md` にも同旨を追記。3は `SettingsView.tsx` / `AuthGate.tsx` / ADR-009 に
「`.finally` のマイクロタスクは `useEffect` フラッシュより先に走るという JS/React のスケジューリング
特性への依存であり、フレームワークの保証ではない」旨を明記。

**関連メモリ**: [[project_ss8_mvp_screens]]（auth stub fail-open）、
[[project_ss19_walk_finish]]（同種のコメント陳腐化パターン）

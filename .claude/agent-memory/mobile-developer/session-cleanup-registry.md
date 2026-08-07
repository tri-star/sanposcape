---
name: session-cleanup-registry
description: サインアウト時にfeature store/queryClientをクリアする一元化パターン（src/lib/sessionCleanup.ts）
metadata:
  type: project
---

SS-19 のローカルレビュー対応で `packages/mobile/src/lib/sessionCleanup.ts` を新設した。
`registerSessionCleanup(fn)` / `runSessionCleanup()` の単純なレジストリで、
各 feature store・`queryClient` が自分のモジュール末尾で自分の後始末を登録し、
サインアウトを実行するレイヤ（現状は `src/features/settings/components/SettingsView.tsx`
の `handleConfirmLogout`）が `runSessionCleanup()` を1回呼ぶだけで済む。

**Why**: 共有端末でアカウントを切り替えたとき、前のユーザーの `useFinishedWalkStore`
（保存待ちの散歩ドラフト＝位置情報の軌跡を含む）や `useActiveWalkStore`（進行中の散歩）が
残ったまま次のユーザーのトークンで送信・上書きされる、というセキュリティレビュー指摘
（Medium）への対応。レビューが「今後 store が増えても同じ指摘が繰り返されないよう、
クリア対象を1箇所にまとめる形にしてほしい」と明記していたため、個別の signOut 呼び出し側を
毎回編集する代わりにレジストリパターンを採用した。

**How to apply**:
- 新しい feature store がサインアウトを跨いで持ち越してはいけないデータを持つ場合、
  そのストアファイルの末尾で `registerSessionCleanup(() => useXxxStore.getState().clear...())`
  を呼ぶ（`useFinishedWalkStore.ts` / `useActiveWalkStore.ts` が実例）。
- `queryClient.clear()`（キャッシュ済みサーバー由来データの残留防止）も同じレジストリに
  登録済み（`src/api/queryClient.ts`）。
- `runSessionCleanup()` は登録済み関数を順に実行し、1つが例外を投げても他を止めない
  （try/catch で個別に握りつぶす）。

**追記（SS-13, 2026-08-06）**: `runSessionCleanup()` の実行側は `SettingsView` から
`src/store/useAuthSessionStore.ts` の `setSession()`（`authenticated → guest` に落ちる時点）へ
移した。これによりサインアウトだけでなく、refresh token 失効による非自発的なセッション終了でも
後始末が走るようになった。`SettingsView` は現在 `router.dismissAll()` +
`router.replace("/(auth)/sign-in")` のスタックを畳む導線のみを担う。
`useAuthSessionStore` 自身は登録側に加えてはいけない（[[auth-session-gate-pattern]] 参照）。
詳細は `packages/mobile/adr/ADR-008-active-walk-state-and-route-cache.md` 決定6 の SS-13 追補、
`packages/mobile/adr/ADR-009-auth-session-state-and-route-gate.md` を参照。

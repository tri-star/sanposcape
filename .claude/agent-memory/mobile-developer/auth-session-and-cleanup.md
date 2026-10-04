---
name: auth-session-and-cleanup
description: 認証セッション(useAuthSessionStore+AuthGate+useAuthSessionBootstrap)とサインアウト時後始末(sessionCleanupレジストリ)で、実装時に壊しやすい構造上の制約。決定の正本はADR-M-009/ADR-M-008
metadata:
  type: feedback
  scope: durable
  adr: packages/mobile/adr/ADR-M-009-auth-session-state-and-route-gate.md
---

決定と理由の正本:
- `packages/mobile/adr/ADR-M-009-auth-session-state-and-route-gate.md`（認証状態の集約・ゲート・
  bootstrap・ログイン直後の遷移先・`app/` からの props 注入。冒頭の要約から読む）
- `packages/mobile/adr/ADR-M-008-active-walk-state-and-route-cache.md` 決定6（sessionCleanup）

ここには、実装・改修時に壊しやすく事故につながる制約だけを残す。

## 認証セッションまわりで守ること

1. `src/store/useAuthSessionStore.ts` から `@/services/auth`（バレル）を**実行時 import しない**
   （`AuthUser` は `import type` で `@/services/auth/types` から）。バレルはネイティブ依存に到達し
   node 環境の vitest を壊す。逆向き（バレル → store）は可。
2. `AuthGate` の `useEffect` 依存に `useSegments()` の配列を入れない。`redirectHref: string | null`
   を依存にする（配列だと毎レンダー発火して `router.replace` を連打しうる）。
3. `AuthGate` は `children` を条件分岐で差し替えない（`<Stack>` が再生成され遷移が壊れる）。
4. `useAuthSessionBootstrap` のラッチはモジュールスコープにし、cleanup で中断しない
   （StrictMode の二重実行で `status` が永久に `loading` になる）。
5. `status === "loading"` の間はゲートが弾かない。
6. **`useAuthSessionStore` 自身を `registerSessionCleanup()` に登録しない**（`loading` に戻すと
   ゲートがスプラッシュへ送り返す）。
7. `features/walk` / `features/history` は認証 store を import できない（oxlint の
   `no-restricted-imports`）。認証状態が要るときは横断 hook を挟まず、`app/` のルートが
   store からプリミティブを selector で読み、View に props で渡す（オブジェクトを返す selector は
   zustand v5 で毎レンダー再描画の原因になる）。文言の組み立ては feature の `lib/` の純粋関数に置く。
8. ログイン直後の遷移先は `features/auth/lib/postSignInDestination.ts` の純粋関数に閉じている。
   変更するときは「進行中の散歩を隠さない」最優先条件と、保存目的のサインイン意思
   （`signInForSaveRequested`）のゲートを壊さない（テストで全象限を固定済み）。

## サインアウト時の後始末（`src/lib/sessionCleanup.ts`）

- サインアウトを跨いで持ち越してはいけないデータを持つ store / キャッシュは、**そのモジュールの
  末尾で自分の後始末を `registerSessionCleanup(...)` で登録する**（`useFinishedWalkStore.ts` /
  `useActiveWalkStore.ts` / `src/api/queryClient.ts` が実例）。signOut 側を個別に編集しない。
- 実行側は `useAuthSessionStore.setSession()` の `authenticated → guest` 遷移のみ
  （非自発的なセッション失効でも走る）。退避と履歴スタックの破棄は `AuthGate` が担う。
- `runSessionCleanup()` は1つが例外を投げても残りを実行する。
- `queryClient` は `clear()` ではなく `removeQueries({ predicate: !isAppConfigQueryKey })` +
  `getMutationCache().clear()`。除外してよいのはユーザー非依存のキャッシュだけで、除外は
  predicate に明示列挙する（新しいキャッシュは既定でクリア対象）。[[feature-flag-app-config-pattern]]
- 「一度も表示しないとモジュールが読み込まれず登録されない」ものは、`app/_layout.tsx` から副作用
  import されるモジュールで登録する（例: `src/lib/imageCacheCleanup.ts`、ADR-M-012）。

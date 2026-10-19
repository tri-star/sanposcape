---
name: auth-and-session
description: mobile の認証セッションと後始末で壊しやすい制約 — store からバレルを import しない、AuthGate の依存と children、bootstrap のラッチ、ログイン後の遷移先、初期化は遅延 throw、永続化の失敗は catch
metadata:
  type: feedback
  scope: durable
  adr: packages/mobile/adr/ADR-M-009-auth-session-state-and-route-gate.md
---

決定の正本は ADR-002（認証方式・3モード）、ADR-M-009（状態の集約・ゲート・`signOut()` による終了・削除後の扱い）、ADR-M-008 決定6（後始末）。
後始末レジストリの規約は `folder-structure.md`、features からの import 禁止と props 注入は `architecture-guideline.md`「認証の扱い」。
ここには実装・改修で壊しやすく、正本に書かれていない制約を置く。

## 認証セッション

1. `src/store/useAuthSessionStore.ts` から `@/services/auth`（バレル）を**実行時 import しない**（型は `import type` で `@/services/auth/types` から）。
   バレルはネイティブ依存に届き、node 環境の Vitest を壊す。逆向き（バレル → store）は可。
2. `AuthGate` の `useEffect` の依存に `useSegments()` の配列を入れない。`redirectHref: string | null` を依存にする（配列だと毎レンダー発火し `replace` を連打しうる）。
3. `AuthGate` は `children` を条件分岐で差し替えない（`<Stack>` が作り直されて遷移が壊れる）。
4. `useAuthSessionBootstrap` のラッチはモジュールスコープに置き、cleanup で中断しない（StrictMode の二重実行で `status` が `loading` のまま止まる）。
5. ログイン直後の遷移先は `features/auth/lib/postSignInDestination.ts` の純粋関数にある。変えるときは「進行中の散歩を隠さない」条件と、
   保存目的のサインイン意思（`signInForSaveRequested`）のゲートを壊さない（全象限をテストで固定済み）。呼び出し元へ戻す `returnTo`（SS-151）は散歩の判定より先に見る＝戻すだけで散歩の画面は隠れない。値は許可リストで検証し、任意の href を渡さない。。
6. セッションを終わらせるときは自前でトークンを消さず `authService.signOut()` を呼ぶ（ADR-M-009）。呼び出し側は reject に備えて catch しておく（ダイアログを操作不能にしないため）。

## services の初期化と後始末

- **モジュールスコープで呼ぶ初期化（`app/_layout.tsx` の `initAuth()` など）で、設定不備を同期 throw しない。** エラーバウンダリの外なので、
  本番ビルドで env の注入を忘れただけで最初の描画前に全ユーザーがクラッシュする。不備は記録だけし、その機能を使った時点で throw する（`googleSignIn.ts` の `configError`）。
- **永続化層の削除失敗は `try/finally` ではなく `try/catch` で握る。** `tokenStore.clear()` は SecureStore の削除失敗で re-throw する契約だが、
  `signOut()` / `doRefresh()` の 401 経路で `finally` にすると上位の「throw しない」契約を壊す。メモリ上は既に破棄済みで、永続化層の失敗は次の 401 で自己修復する。
- 「一度も表示されないとモジュールが読み込まれず登録されない」後始末は、`app/_layout.tsx` から副作用 import されるモジュールで登録する（`src/lib/imageCacheCleanup.ts`）。

Related: [[navigation]], [[api-and-http]]

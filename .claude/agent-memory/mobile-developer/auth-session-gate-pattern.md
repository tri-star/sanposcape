---
name: auth-session-gate-pattern
description: SS-13で確立した認証セッション状態の集約パターン(useAuthSessionStore + AuthGate + useAuthSessionBootstrap)。今後の認証まわり・ゲート系の実装で必ず踏襲する構造上の制約を含む。
metadata:
  type: project
---

SS-13 で `packages/mobile/src/store/useAuthSessionStore.ts` / `src/features/auth/lib/authGate.ts` /
`src/features/auth/components/AuthGate.tsx` / `src/features/auth/hooks/useAuthSessionBootstrap.ts` を
新設し、認証状態の参照とゲートを1箇所に集約した（詳細は
`packages/mobile/adr/ADR-009-auth-session-state-and-route-gate.md`）。

**Why**: それまで `SplashView` が `restoreSession()` を、`SettingsView` が
`authService.getCurrentUser()` を各自で読んでおり、(1) ディープリンクのコールドスタートで
復元が走らない、(2) 未認証を弾くゲートが存在せず画面ごとの自衛に依存、(3)
`createSessionAuthService` の `onSessionChange`（401→refresh失敗の通知用）が誰にも配線されて
おらず失効がUIに伝わらない、という3つの構造的な穴があった。

## 構造上絶対に守ること（事故につながりやすい）

1. **`src/store/useAuthSessionStore.ts` から `@/services/auth`（バレル）を実行時 import しない**。
   `AuthUser` は `import type` で `@/services/auth/types` から取る。バレルは `getAuthMode()` の
   結果次第でネイティブ依存（`expo-secure-store` / `react-native-nitro-google-signin`）に到達し、
   node環境のvitestを壊す。逆向き（`services/auth/index.ts` → store）は許可（ストア側が純粋なので
   循環参照にならない）。
2. **`AuthGate` の `useEffect` 依存に `useSegments()` の戻り値（配列）を直接入れない**。
   レンダーごとに同一性が変わるため、redirect中に毎レンダー発火して `router.replace` を連打しうる。
   `resolveAuthGateDecision` の結果から `redirectHref: string | null` を作り、それを依存にする。
3. **`AuthGate` は `children` を条件分岐で差し替えない**（`{status==="loading"?null:children}` 禁止）。
   `<Stack>` がアンマウントされてナビゲータが再生成され、遷移が壊れる。ナビゲーションは
   effectの中だけで行う。
4. **`useAuthSessionBootstrap` のラッチはモジュールスコープ変数にし、cleanupで中断しない**
   （`AbortController.abort()` しない）。`AuthGate` はルートに常駐しアンマウントされないため
   中断は不要で、StrictModeの「effect→cleanup→effect」二重実行で1回目を中断すると2回目が
   ラッチで弾かれ `status` が永久に `loading` のままになる。
5. **`status === "loading"` の間はゲートが絶対に弾かない**（`resolveAuthGateDecision` の最優先分岐）。
   復元中に誤ってサインイン画面へ飛ばさないため。
6. **`useAuthSessionStore` 自身を `registerSessionCleanup()` に登録しない**
   （[[session-cleanup-registry]] 参照）。このストアは「クリアされる側」ではなく
   「セッション状態そのもの」で、`loading` に戻すとゲートがスプラッシュへ送り返してしまう。

## 弾く条件を1関数に閉じる

`canEnterProtectedRoutes(status: ResolvedAuthSessionStatus): boolean`（`authGate.ts`）が
唯一の判定箇所。将来ゲスト散歩を許可する変更はこの1関数に `"guest"` を足すだけで済む設計にした。
`splashDestination.ts` もこの関数を共有することで「スプラッシュは通したのにゲートが弾く」という
食い違いを構造的に防いでいる。

## `services/auth/index.ts` が「認証の合成ルート」

`onSessionChange` コールバック（`useAuthSessionStore.getState().setSession(user)` を呼ぶ）を
real/dev/mock 全てのファクトリに `deps.onSessionChange` として渡す。`initAuth()` が
`@/api/authTokenProvider` へ登録するのと同じ役割の延長として、バレルに配線ロジックを置く。
`createMockAuthService` にも `onSessionChange` を追加し、`EXPO_PUBLIC_AUTH_MODE=mock` の
開発ビルドでもゲートが機能するようにする（`restoreSession()` は失敗を返すだけなので通知しない
＝real/devの復元失敗時と挙動を揃える）。

## AuthGate は片方向ゲート

認証済みユーザーを `(auth)` から追い出さない。双方向にすると `/dev-screens` からサインイン画面を
開けなくなり遷移が往復する。サインイン成功後の遷移は `useAuthActions` の
`router.replace("/walk-start")` に任せる。

## oxlintでの構造的な依存禁止パターン

`.oxlintrc.json` の `overrides`（`files` + `no-restricted-imports`）で
`features/walk` / `features/history` から `@/services/auth` 系・`@/store/useAuthSessionStore`
への import を禁止した。既存コードが依存していなければ新規違反ゼロで通り、「探索/散歩ロジックは
認証状態に依存しない」を規律ではなく構造で担保できる。将来ゲスト散歩でwalk側が認証状態を見る
必要が出ても、overrideを外すのではなく「ゲスト可否」をprops/引数で渡す形に寄せる方針
（ADR-009の申し送り）。

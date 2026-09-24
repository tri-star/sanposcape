---
name: auth-scenarios
description: mobile で 401 が起きる2つの経路（ゲストのまま / セッション失効）の違いと、セッション破棄を再利用する唯一の作法
metadata:
  type: feedback
  scope: durable
  adr: packages/mobile/adr/ADR-009-auth-session-state-and-route-gate.md
---

`/walks` 系 API の 401 には性質の違う2経路がある。**どちらの話をしているか毎回確認すること。**

| | ゲストのまま（SS-57 以降の主役） | セッション失効（refresh token 失効） |
|---|---|---|
| セッション遷移 | 起動時から `guest` のまま（遷移なし） | `authenticated → guest` |
| `runSessionCleanup()` | 走らない（walk ドラフト・Query キャッシュは無傷） | 走る（`useFinishedWalkStore` / `useActiveWalkStore` / `queryClient` がクリアされる） |
| `AuthGate` の退避 | しない（画面に留まる） | `shouldEvacuateOnSessionEnd` が true → `dismissAll()` + `replace("/(auth)/sign-in")` |
| customFetch の refresh 再送 | しない（`shouldRefreshAndRetry` は `hadToken` が必要） | 1回試して失敗した後に 401 が表面化 |

**Why:** SS-37 の初期ブリーフは「CTA を出しても保存対象が消えている」という前提だったが、実際には消えるのは失効側だけで、その側は AuthGate が既にサインイン画面へ退避させるため行き止まりではなかった。取り違えると ADR-008 決定6（サインアウト時のドラフトクリア＝共有端末の事故防止）を不要に覆すプランになる。

**How to apply:** 「ゲストで degrade する話」なのか「セッションが切れる話」なのかを最初に切り分ける。前者は状態が残るので画面上の導線で解ける。後者で失われるデータの回復は**ドラフト永続化（SS-36）待ち**で、個別タスクでは解かない。

## 「セッションを終わらせたい」機能を作るときの唯一の作法（SS-62 で確認）

自前でトークンを消したり `useAuthSessionStore.setSession(null)` を呼ぶ実装を書かず、
**`authService.signOut()` を呼ぶだけ**にする。これだけで
`POST /auth/logout` →（real は Google ネイティブ破棄）→ `tokenStore.clear()` →
`onSessionChange(null)` → `setSession(null)`（`authenticated → guest` の遷移でのみ
`runSessionCleanup()`）→ `AuthGate` の `dismissAll()` + `replace("/(auth)/sign-in")` まで走る。
画面/フックは `router` を触らない（ADR-009 決定6）。

- **`signOut()` は現実装では reject しない**（`createSessionAuthService.signOut()` が `api.logout` /
  `onSignOut` / `tokenStore.clear()` を全部 try/catch し、`secureRefreshTokenPersistence.load()` も
  内部で例外を潰して null を返す）。それでも呼び出し側は catch しておく（既存のログアウト導線も
  「将来の実装が reject してもダイアログを操作不能にしない」ために catch している）。
- 順序の効能: トークン破棄がキャッシュクリアより**前**なので、クリア直後の再フェッチが有効な
  トークンで前ユーザーのデータを取り直す窓が無い。
- `features/*` から `setSession(null)` を直接呼ぶ案は ADR-009 決定2（書き込み経路は
  `services/auth` の `onSessionChange` と `useAuthSessionBootstrap` の2つだけ）違反。
- 破壊的 API（`DELETE /users/me` 等）が 401 のときは「ローカルを掃除して成功扱い」にしない。
  上表の失効側なら放っておいても自己修復する（＝端末にデータは残らない）。
- `runSessionCleanup()` に登録済みなのは `queryClient.clear()` /
  `useFinishedWalkStore.clearFinishedWalk()` / `useActiveWalkStore.endWalk()` の3つ。
  個別の `invalidateQueries` を書き足す必要はない。

補足（確認済みの事実）:
- backend は Authorization 欠落でも **403 ではなく 401** を返す（`packages/backend/src/sanposcape/auth/tests/test_dependencies.py::test_missing_authorization_header_returns_401_not_403` が回帰を固定）。mobile のエラー分類が `unauthorized` になる前提はここに依存している。
- `useAuthSessionStore.setSession()` は `authenticated → guest` のときだけ cleanup を走らせる。`guest → authenticated`（ゲストがサインイン）では何も消えない。

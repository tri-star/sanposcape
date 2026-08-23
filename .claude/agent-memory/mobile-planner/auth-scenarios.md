---
name: auth-scenarios
description: mobile で 401 が起きる2つの経路（ゲストのまま / セッション失効）の違い。混同すると設計を誤る
metadata:
  type: project
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

補足（確認済みの事実）:
- backend は Authorization 欠落でも **403 ではなく 401** を返す（`packages/backend/src/sanposcape/auth/tests/test_dependencies.py::test_missing_authorization_header_returns_401_not_403` が回帰を固定）。mobile のエラー分類が `unauthorized` になる前提はここに依存している。
- `useAuthSessionStore.setSession()` は `authenticated → guest` のときだけ cleanup を走らせる。`guest → authenticated`（ゲストがサインイン）では何も消えない。

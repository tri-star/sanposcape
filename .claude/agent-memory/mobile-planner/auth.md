---
name: auth
description: 認証まわりでプランを書くときの前提 — 正本はADR-002/ADR-M-009、構造上の制約（client.tsはservices/authをimportしない等）、401の2経路（ゲスト/失効）、セッションを終わらせる唯一の作法はsignOut()
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md
---

## 正本

- 認証方式（Google 直結・自前セッショントークン・`EXPO_PUBLIC_AUTH_MODE = real | dev | mock` で既定 real）と、
  mobile と auth API の契約（snake_case ⇔ camelCase の変換は `sessionMapper.ts` / `authApi.ts` の2箇所、
  `GET /auth/me` は mobile から呼ばない、`POST /auth/dev-session` は Orval に出ないのでローカル DTO が要る）は
  `docs/adr/ADR-002-auth-google-signin-and-stub-strategy.md`。
- セッション状態・認証ゲート・ゲスト可否は `packages/mobile/adr/ADR-M-009-auth-session-state-and-route-gate.md`。
  「`canEnterProtectedRoutes` に `"guest"` を足すだけ」は誤りだった（`splashDestination.ts` と退避条件も変わる。SS-57 追補）。
  認証ゲート・ゲスト可否に触るプランでは同 ADR の SS-57 追補を必ず読む。
- 認証系の PR は backend 先行 → mobile が既定。mobile 着手前に `packages/backend/openapi.yaml` に必要な `/auth/*` があるか確認する。

## プランで外してはいけない構造上の制約

- **`src/api/client.ts` は `src/services/auth` を import できない**（循環参照、かつ `expo-secure-store` / ネイティブ Google SDK が
  芋づるで読まれて node 環境の vitest が壊れる）。`src/api/authTokenProvider.ts` のレジストリを挟む。
- **`/auth/*` は `customFetch` を通さない**専用の生 fetch（通すと 401 → refresh → 401 の再帰）。HTTP 出口が2つになる
  （[[project-cloudfront-client-contract]]）。
- refresh は single-flight。refresh 失敗は **401 = セッション破棄 / ネットワークエラー = 保持**。
- ネイティブ import は Google SDK ラッパと SecureStore 永続化の2ファイルに閉じ、他は DI の純粋関数にして vitest でテストする。
- ネイティブモジュール追加は development build の作り直しが要る（ADR-M-003）。Android は署名鍵ごとに SHA-1 登録が要る
  （未登録は `DEVELOPER_ERROR`）。
- `features/walk|history|pin/**` から認証状態は読めない（oxlint。ADR-M-009 決定8）→ `app/` のルートで読んで props 注入
  （[[planning-constraints]]）。identity の単一の情報源は `useAuthSessionStore.user`。`GET /auth/me` で取り直さない。

## 401 の2経路（どちらの話か毎回切り分ける）

| | ゲストのまま（SS-57 以降の主役） | セッション失効（refresh token 失効） |
|---|---|---|
| セッション遷移 | 起動時から `guest`（遷移なし） | `authenticated → guest` |
| `runSessionCleanup()` | 走らない（ドラフト・Query キャッシュは無傷） | 走る（`useFinishedWalkStore` / `useActiveWalkStore` / `queryClient` をクリア） |
| `AuthGate` の退避 | しない（画面に留まる） | `shouldEvacuateOnSessionEnd` → `dismissAll()` + `replace("/(auth)/sign-in")` |
| customFetch の refresh 再送 | しない（`hadToken` が必要） | 1回試して失敗した後に 401 が表面化 |

**Why:** SS-37 の初期ブリーフは「CTA を出しても保存対象が消えている」前提だったが、消えるのは失効側だけで、その側は AuthGate が
退避させるので行き止まりではなかった。取り違えると ADR-M-008 決定6（サインアウト時のドラフトクリア）を不要に覆すプランになる。

**How to apply:** 「ゲストで degrade する話」なら画面上の導線で解ける。「セッションが切れる話」で失われるデータの回復は
ドラフト永続化（SS-36、未着手）待ちで、個別タスクでは解かない。

## セッションを終わらせる唯一の作法（SS-62 で確認）

自前でトークンを消したり `setSession(null)` を呼ばず、**`authService.signOut()` を呼ぶだけ**にする。
`POST /auth/logout` → `tokenStore.clear()` → `onSessionChange(null)` → `setSession(null)`（`authenticated → guest` のときだけ
`runSessionCleanup()`）→ `AuthGate` の退避まで走る。画面/フックは `router` を触らない（ADR-M-009 決定6）。

- `signOut()` は現実装では reject しないが、呼び出し側は catch しておく（ダイアログを操作不能にしないため）。
- トークン破棄がキャッシュクリアより前なので、前ユーザーのデータを取り直す窓が無い。
- `features/*` から `setSession(null)` を直接呼ぶのは ADR-M-009 決定2 違反。
- 破壊的 API（`DELETE /users/me` 等）が 401 のとき「ローカルを掃除して成功扱い」にしない。
- `runSessionCleanup()` の登録は `queryClient.clear()` / `clearFinishedWalk()` / `endWalk()` の3つ。個別の `invalidateQueries` は不要。
- backend は Authorization 欠落でも 403 ではなく 401 を返す（`auth/tests/test_dependencies.py` が固定）。
- `guest → authenticated`（ゲストのサインイン）では何も消えない。

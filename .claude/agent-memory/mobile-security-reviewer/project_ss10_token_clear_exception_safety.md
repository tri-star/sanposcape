---
name: project_ss10_token_clear_exception_safety
description: SS-10 (2026-07-26時点) createSessionAuthService の signOut / doRefresh unauthorized 節が tokenStore.clear() の reject を捕捉しておらず、setCurrentUser(null) がスキップされ得る（Medium指摘、要再確認）
type: project
---

`packages/mobile/src/services/auth/tokenStore.ts` の `clear()` は `persistence.remove()`（SecureStore.deleteItemAsync）が
reject すると、内部状態(access/refreshTokenCache)は `finally` でクリアしつつも **例外を再スローする**。
これは `tokenStore.test.ts`（`persistence.remove が reject しても access token はクリアされる`）で明示的にテストされ、
意図された挙動として存在する。

しかし `createSessionAuthService.ts` の呼び出し側 2箇所がこの reject を捕捉していない:
- `doRefresh()` の `catch` 節内、401(unauthorized) 判定後の `await tokenStore.clear(); setCurrentUser(null);`（signOut と同じ問題）
- `signOut()` の末尾 `await tokenStore.clear(); setCurrentUser(null);`（`api.logout` / `onSignOut` は try/catch で握りつぶしているのに、ここだけ無防備）

**Why:** SecureStore の削除が失敗する（Keystore破損・OS更新直後・biometric lock等、稀だが `tokenStore.secure.ts` の
`load()` 側コメントで既に想定されている失敗モード）と、例外が `doRefresh`/`signOut` の外へ伝播し、
1) `setCurrentUser(null)` が実行されず `getCurrentUser()` が古いユーザーを返し続ける（トークンは実質失効済みなのに
   UI/SS-13の認証ゲートは「ログイン中」と誤認しうる）、
2) `refreshAccessToken()`/`restoreSession()` は「throw しない契約」（`client.ts` がこの戻り値のみを見る設計）を
   破り、`customFetch` や起動時セッション復元で未処理の Promise rejection になり得る。

**How to apply:** SS-10 の指摘としては Medium（native storage failure という低頻度トリガが必要なため）。
このコードに再度触れる将来の PR（signOut 改修・SS-13 の認証ゲート実装等）では、
`tokenStore.clear()` 呼び出し箇所が try/catch (or try/finally) で必ず `setCurrentUser(null)` を実行するよう
修正されたか確認する。修正済みなら本メモリは解消として更新する。
[[project_auth_stub_switch]] とセットで、SS-10系タスクの再レビュー時に参照する。

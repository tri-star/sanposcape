---
name: auth-cleanup-asymmetric-error-swallow
description: signOut系のクリーンアップ処理で一部の失敗だけtry/catchで握りつぶし、残りは無防備というasymmetryが起きやすい（SS-10 createSessionAuthService.signOutで発見）
metadata:
  type: project
---

SS-10（`packages/mobile/src/services/auth/createSessionAuthService.ts` の `signOut()`）で見つかったパターン。
`api.logout()` と `onSignOut()` の失敗は明示的に `try/catch` で握りつぶす（コメント「失敗しても握りつぶす
（ローカルは必ずクリアする）」）一方、同じメソッド内の `tokenStore.clear()` の呼び出しだけ try/catch が無く、
`tokenStore.ts` 側の `clear()` 実装は「persistence が失敗してもメモリ上の状態は try/finally で必ずクリアする」
設計なのに、例外自体は再 throw する（`await persistence.remove()` を try/finally で包み、finally 内で
状態をクリアしつつ元の reject は伝播させる)。結果として `tokenStore.clear()` が reject すると
`signOut()` 全体が reject し、後続の `setCurrentUser(null)` / `onSessionChange(null)` が実行されず、
`getCurrentUser()` はサインアウト後も stale なユーザーを返し続ける半端な状態になり得る
（レビュー時点でこの経路のテストは無かった）。

**Why:** 「同じメソッド内で一部の失敗だけ意図的に握りつぶし、もう一部は素通し」という非対称な実装は、
コピペ漏れ・後からの追加箇所の見落としとして非常に起きやすく、かつテストでも見つかりにくい
（正常系テストと「代表的な1箇所の失敗」テストだけでは他の失敗経路が素通しになっていることに気づけない）。
認証のサインアウト/クリーンアップ処理は「必ず成功する（少なくともローカル状態は必ず初期化される）」という
暗黙の契約を持つことが多く、この非対称性は実害が出やすい。

**How to apply:** signOut・ログアウト・リソース解放など「複数のクリーンアップ手順を順番に実行し、
どれか1つが失敗しても後続は必ず実行したい」意図のメソッドをレビューするときは、各ステップの
try/catch の有無を横並びで確認し、一部だけ無防備になっていないかを機械的にチェックする。
指摘時は「このステップだけ他と扱いが違う理由があるか」を確認質問として投げるとよい（意図的な差別化かもしれない）。
なお、この具体的な指摘（SS-10, 2026-07-26時点）は次回レビュー時点で既に修正されている可能性があるため、
再レビュー時は現在のコードで再確認すること。

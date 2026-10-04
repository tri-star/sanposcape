---
name: cleanup-registry-and-error-isolation
description: feature 間の後始末はレジストリパターン（sessionCleanup/walkDeletionCleanup）で解決する。直接 import を提案しない。signOut などの後始末で、一部のステップだけ try/catch していない非対称を横並びで確認する
metadata:
  type: feedback
  scope: durable
  adr: packages/mobile/adr/ADR-M-008-active-walk-state-and-route-cache.md
---

## feature 間の後始末レジストリ

`docs/folder-structure.md` は feature 間の直接 import を禁じている。そのため、ある feature の
アクションで別 feature の store をクリアしたいときは、`src/lib/` の Set ベースのレジストリを使う。
クリアされる側がモジュール読み込み時に `register〜Cleanup(fn)` で登録し、
クリアする側は `run〜Cleanup(...)` を呼ぶ。

- `src/lib/sessionCleanup.ts`: サインアウトやセッション失効時。`useAuthSessionStore.setSession()` から呼ぶ。
- `src/lib/walkDeletionCleanup.ts`（SS-60）: 散歩の削除時。
- `src/lib/backgroundLocationCleanup.ts`: 位置記録バッファの削除とタスクの停止。

型は毎回同じで、`Set<Cleanup>`＋`register`/`run`（1つが失敗しても他を止めない try/catch）＋
`reset〜ForTest` の組み合わせ。決定の経緯は
`packages/mobile/adr/ADR-M-008-active-walk-state-and-route-cache.md` の決定6/決定8 にある。

**How to apply:** 「片方のアクションでもう片方の状態をクリアしたい」要求には、まずこのパターンを
提案する。このパターンを使っている実装に「なぜ直接 import しないのか」と指摘しない。

## 後始末ステップの try/catch の非対称

SS-10 の `createSessionAuthService.ts` の `signOut()` では、`api.logout()` と `onSignOut()` は
try/catch で握りつぶしていたのに、`tokenStore.clear()` だけ無防備だった。clear が reject すると
後続の `setCurrentUser(null)` が実行されず、サインアウト後も古いユーザーが返り続けていた
（SS-13 で対称化し、「H2回帰」テストで固定済み）。

**Why:** 一部だけ意図的に握りつぶす非対称な実装は、コピペ漏れや後からの追加で起きやすい。
正常系テストと代表的な1経路の失敗テストだけでは見つからない。後始末には
「少なくともローカル状態は必ず初期化される」という暗黙の契約があることが多く、実害が出やすい。

**How to apply:** 複数の後始末を順に実行するメソッド（signOut・ログアウト・リソース解放・
レジストリの `run`）では、各ステップの try/catch の有無を横並びで確認する。差があれば
「このステップだけ扱いが違う理由はあるか」と確認質問を投げる。

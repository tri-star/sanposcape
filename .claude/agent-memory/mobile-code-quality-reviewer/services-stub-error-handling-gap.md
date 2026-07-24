---
name: services-stub-error-handling-gap
description: src/services/*.stub.ts は常に成功するため、呼び出し側フックのエラーハンドリング欠如が単体テスト/実行時に顕在化しない
metadata:
  type: project
---

`src/services/<service>/index.ts` は `EXPO_PUBLIC_USE_*_STUB` で real/stub を切り替える設計
（`docs/architecture-guideline.md` のスタブ差し替え方針）。stub 側は常に `Promise` を resolve
するため、呼び出し側（例: `src/features/auth/hooks/useAuthActions.ts`）が
`.then()` だけで `.catch()` を持たなくても、テストや通常の開発フローでは問題が表面化しない。

**Why:** real 実装（例: `src/services/auth/auth.real.ts`）は意図的に `throw` するように
書かれている（real/stub 切り替え漏れに早期に気づかせるため）。つまり `EXPO_PUBLIC_USE_AUTH_STUB=false`
にした瞬間、`.catch` の無い呼び出し側は「ボタンを押しても何も起きない」（unhandled rejection）
状態になる。同じ機能内で「非スコープ操作は Toast でフィードバックする」方針
（`src/hooks/useToast.ts`）が既に確立されているのに、`services/*` 経由の失敗パスにはこの
フィードバックが適用されていないことがある。

**How to apply:** `src/services/*` の interface を呼ぶ hook（`useAuthActions` に限らず、
今後 pin/spot 系の services が増えたときも同様）をレビューするときは、
`.then()` に対応する `.catch()`（またはローディング/エラー state）があるか、
無ければ P2 として指摘する。stub が常に成功するからといって「エラーハンドリング不要」とは
判断しない。

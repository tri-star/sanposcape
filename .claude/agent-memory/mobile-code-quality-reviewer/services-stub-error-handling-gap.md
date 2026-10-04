---
name: services-stub-error-handling-gap
description: src/services/* の mock/dev 実装は常に成功しがちなので、呼び出し側 hook の .catch やエラーフィードバックの欠如が開発中に表面化しない。real では失敗しうる前提でレビューする
metadata:
  type: feedback
  scope: durable
---

`src/services/<service>/index.ts`（auth/location/photo など）は、`EXPO_PUBLIC_<SERVICE>_MODE`
（`real`/`dev`/`mock`）で実装を切り替える。モード判定は各 `index.ts` の1か所に集約されている。
mock や dev は通常は成功を返すため、呼び出し側（例: `src/features/auth/hooks/useAuthActions.ts`）が
`.then()` だけで `.catch()` を持たなくても、テストや開発中には問題が見えない。

**Why:** real 実装（例: `auth.real.ts` の Google ネイティブサインイン → `POST /auth/session`）は、
ネットワークやキャンセル、トークン交換の失敗で reject しうる。`.catch` が無いと、本番で
「ボタンを押しても何も起きない」（unhandled rejection）状態になる。非スコープ操作は
Toast（`src/hooks/useToast.ts`）でフィードバックする方針が既にあるのに、services 経由の失敗には
適用されていないことがある。

**How to apply:** `src/services/*` の interface を呼ぶ hook では、`.then()` に対応する `.catch()`
（またはローディングとエラーの state）があるか確認する。無ければ P2 として指摘する。
mock が常に成功することを理由に、エラーハンドリングを不要と判断しない。

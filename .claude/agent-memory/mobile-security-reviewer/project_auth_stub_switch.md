---
name: project_auth_stub_switch
description: [解決済み・SS-10] src/services/auth の real/stub 切替は SS-8 時点で fail-open だったが、SS-10 (2026-07-26 確認) で fail-safe な3モード実装に是正された
type: project
---

**2026-07-26 追記（SS-10 レビューで確認・解決済み）**: 本メモリが指摘していた問題は ADR-002 と SS-10 実装で解消された。
`packages/mobile/src/config/authMode.ts` の `parseAuthMode()` が `"dev"`/`"mock"` 完全一致のみ許可し、
未設定・空文字・旧値`"stub"`・大文字はすべて `"real"` にフォールバックする（fail-safe、テストで担保済み）。
`eas.json` の変数名は `EXPO_PUBLIC_AUTH_MODE` に統一され、コード側と完全一致した。
`mock` モードは `src/services/auth/index.ts` で `!__DEV__ && NODE_ENV !== "test"` のとき起動時に throw するガードあり。
**以下は SS-8 時点の記録（歴史的経緯として保持）**。

`packages/mobile/src/services/auth/index.ts` の real/stub 切替は次の実装（SS-8 時点、2026-07-24 確認）:

```ts
const useStub = process.env.EXPO_PUBLIC_USE_AUTH_STUB !== "false";
```

つまり **既定値は stub**（`EXPO_PUBLIC_USE_AUTH_STUB` が未設定 or それ以外の値でも stub になる = fail-open）。

一方 `packages/mobile/eas.json` は:
- `build.preview.env` で `EXPO_PUBLIC_AUTH_MODE: "stub"` を設定（コードが読む変数名と**不一致**。`EXPO_PUBLIC_USE_AUTH_STUB` ではない）
- `build.production` には認証関連の env 設定が一切ない

**Why:** 現時点（SS-8）は `auth.real.ts` が `throw new Error(...)` するだけの未実装スタブなので実害はないが、将来 real 実装を追加した際にこの構造のまま放置すると、production ビルドでも `EXPO_PUBLIC_USE_AUTH_STUB` が未設定のため **stub（常時ログイン成功）が有効なままリリースされる**リスクがある。fail-open な既定値と変数名不一致が組み合わさっている点が危険。

**How to apply:** real 認証実装タスク（このタスクでは非スコープ）が来たら、必ず次を確認する:
1. `src/services/auth/index.ts` の判定変数名と `eas.json` の env 変数名が一致しているか
2. 既定値が fail-closed（未設定なら real を使う、または CI/ビルドスクリプトで明示必須にする）になっているか
3. `eas.json build.production` に該当 env が明示されているか
これらが未対応ならレビューで P2 として指摘する。

---
name: project_auth_stub_switch
description: 認証モードの env パースは fail-safe（既定 real・未知の値は real へフォールバック）。SS-8の fail-open 実装はSS-10で是正済み。新しい mode 系 env を追加するPRでの確認観点
metadata:
  type: feedback
  scope: durable
---

**SS-8 時点の `src/services/auth/index.ts` は fail-open だった**
（`EXPO_PUBLIC_USE_AUTH_STUB !== "false"` で既定 stub。かつ `eas.json` が読ませていた変数名
`EXPO_PUBLIC_AUTH_MODE` と不一致で、`build.production` には認証関連の env が一切無かった）。
このまま real 実装を足すと **production ビルドでも stub（常時ログイン成功）が有効なまま
リリースされる**構造だった。

**SS-10 で是正済み（2026-07-26 確認）:**
- `src/config/authMode.ts` の `parseAuthMode()` が `"dev"` / `"mock"` の完全一致のみ許可し、
  未設定・空文字・旧値 `"stub"`・大文字はすべて `"real"` にフォールバックする（fail-safe、テストで担保）。
- `eas.json` の変数名は `EXPO_PUBLIC_AUTH_MODE` に統一され、コード側と完全一致した。
- `mock` モードは `src/services/auth/index.ts` で `!__DEV__ && NODE_ENV !== "test"` のとき
  起動時に throw するガードがある。

**Why:** fail-open な既定値と変数名の不一致が組み合わさると、**production だけで発現する**
認証バイパスになる。同じ形の罠は backend の `AUTH_MODE` / `MAPS_MODE` でも踏まれており
（実際に staging が認証バイパス状態になっていた）、許可リスト方式の fail-safe へ揃えられた。

**How to apply:** 新しい mode 系の env（`EXPO_PUBLIC_*_MODE` 等）を追加する PR では必ず確認する:
1. コード側が読む変数名と `eas.json` / `app.config.ts` の env 変数名が一致しているか
2. **既定値が fail-closed か**（未設定なら安全側の値。未知の値も安全側へフォールバックするか）
3. `eas.json` の `build.production` に該当 env が明示されているか（または明示不要な設計になっているか）

未対応なら P2 として指摘する。`location` サービスも同じ `parseLocationMode()` の形を踏襲済み
（[[project_ss15_location_maps]]）。

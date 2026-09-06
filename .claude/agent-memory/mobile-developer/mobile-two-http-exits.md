---
name: mobile-two-http-exits
description: mobile の HTTP 出口は2箇所ある（customFetch と authApi.ts の生fetch）。横断的関心事（認証ヘッダー・署名用ヘッダー等）は両方に適用しないと片方だけ壊れる
metadata:
  type: reference
  scope: durable
---

## mobile には HTTP 出口が2箇所ある（1箇所ではない）

| # | 出口 | 対象パス | 備考 |
|---|---|---|---|
| 1 | `src/api/client.ts` の `customFetch`（Orval mutator） | `/spots` `/users/*` `/explore/*` `/walks*` `/auth/me` `/health` | `withAuthHeader` でトークン付与、401→refresh→1回リトライ |
| 2 | `src/services/auth/authApi.ts` の `createAuthApi().post()` | `/auth/session` `/auth/dev-session` `/auth/refresh` `/auth/logout` | **意図的に** `customFetch` を使わない生 fetch |

`authApi.ts` が `customFetch` を使わないのは設計意図（401 → refresh → 401 → refresh の再帰を避けるため）。
`authApi.ts` 冒頭 JSDoc と `packages/mobile/docs/architecture-guideline.md` に根拠がある。

**How to apply**: リクエストヘッダーの付与・ボディの加工など「全リクエストに共通で適用すべき」変更を
`client.ts` に入れるとき、`authApi.ts` の4本（すべてボディを伴う POST）に入れ忘れていないか必ず確認する。
入れ忘れると「認証関連（サインイン・リフレッシュ・ログアウト）だけが動かない」という
切り分けが難しい壊れ方をする（起動直後から一切使えなくなるため、原因が探索系APIに見えてしまう）。

共有ロジックは `src/api/` 配下の独立モジュール（例: `src/api/contentHash.ts`）に切り出し、
`client.ts` と `authApi.ts` の両方から import する構成にする（SS-70 で `x-amz-content-sha256` の付与、
`X-App-Authorization` への変更で実施）。

関連: [[orval-customfetch-contract]]

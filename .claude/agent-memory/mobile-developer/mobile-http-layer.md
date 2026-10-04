---
name: mobile-http-layer
description: mobileのHTTP出口は3箇所(customFetch/authApi.tsの生fetch/S3直送)。横断的関心事の適用範囲、Orval customFetchの{status,data,headers}契約、ApiError.body+getApiErrorCodeでの原因分岐、Orvalのcursor=null落とし穴
metadata:
  type: reference
  scope: durable
  adr: packages/mobile/adr/ADR-M-010-photo-service-and-direct-s3-upload.md
---

正典: `packages/mobile/docs/architecture-guideline.md`（HTTP 出口の節）、
`packages/mobile/adr/ADR-M-010-photo-service-and-direct-s3-upload.md`（決定4、T15 追補）、
`docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md`（決定4: `X-App-Authorization` /
`x-amz-content-sha256`、クライアントの再送ポリシー）。

## HTTP 出口は3箇所ある

| # | 出口 | 対象 | 備考 |
|---|---|---|---|
| 1 | `src/api/client.ts` の `customFetch`（Orval mutator） | backend の大半の API | `withAuthHeader` でトークン付与、401→refresh→1回リトライ、`transientRetry`（GET/HEAD のみ） |
| 2 | `src/services/auth/authApi.ts` の `createAuthApi().post()` | `/auth/session` `/auth/dev-session` `/auth/refresh` `/auth/logout` | **意図的に** `customFetch` を使わない生 fetch（401→refresh の再帰を避ける。`/auth/refresh` は再送するとトークンローテーションの再利用検知でセッションが失効するため再送も入れない） |
| 3 | `src/features/pin/api/presignedPostUpload.ts` | S3 / fake storage への presigned POST 直送 | 認証ヘッダー・`x-amz-content-sha256`・ベース URL・401→refresh・`transientRetry` を**入れてはいけない**。送信先は `isAllowedUploadUrl` で検証 |

**How to apply:**
- backend 向けの横断的変更（ヘッダー付与・ボディ加工等）を `client.ts` に入れるときは、
  `authApi.ts` の4本（すべてボディを伴う POST）にも入れたか必ず確認する。入れ忘れると
  「認証関連だけ動かない」切り分けの難しい壊れ方をする（起動直後から使えず、原因が探索系 API に見える）。
  共有ロジックは `src/api/` の独立モジュール（例: `src/api/contentHash.ts`）に切り出して両方から import する。
- 3（S3 直送）には backend 向けの横断ヘッダーを入れない。
- `fetch` の `redirect` オプションは RN 実機では効かない（`whatwg-fetch` の `Request` が読まない）。
  これで守られていると思わないこと（`client.ts` / `presignedPostUpload.ts` の注記参照）。

## `customFetch` は `{ status, data, headers }` を返す契約

`orval.config.ts` の `client: "react-query"` + `httpClient: "fetch"` で生成される関数は
`Promise<{ data: T; status: 200 } & { headers: Headers } | ...>` 型で、生成コードは
`return customFetch<...>(url, options)` するだけ。**mutator 側がこの形を返す責務を持つ**
（SS-15 で生本文を返していたバグを修正）。`customFetch` は「2xx のみ到達・非2xx は `ApiError` を throw」
の前提で `{ status: response.status, data, headers: response.headers }` を返す。

**How to apply:** 生成エンドポイントを呼ぶコードでは `response.status` を確認してから
`response.data` を使う（narrowing のため）。参照実装: `src/features/walk/api/exploreApi.ts`、
`src/api/client.ts` / `client.test.ts`。

## 同じステータスの原因分岐は `ApiError.body` → `getApiErrorCode()`

`customFetch` は非2xx 応答の本文を JSON パース（失敗時 `undefined`）して
`new ApiError(status, undefined, body)` に載せる。`getApiErrorCode(error)` が `body.code`（文字列）を返す。
第3引数は省略可能なので既存の `new ApiError(status[, message])` 呼び出しは互換。

**How to apply:** 新しい原因分岐が必要になったら backend に機械可読な `code` を追加してもらい、
分類関数（例: `features/pin/lib/pinSaveError.ts`）で `getApiErrorCode(cause)` を見る。`code` が
無い・未知のときは既存の安全側デフォルトに倒す。`authApi.ts`（出口2）はこの仕組みの対象外なので、
認証エラーで同様の分類が必要なら個別に適用する。

## Orval の URL ビルダーは `null` を文字列 `"null"` にする

生成された `get<Xxx>Url(params)` は `value !== undefined` なら
`normalizedParams.append(key, value === null ? 'null' : String(value))` する。`{ cursor: null }` を渡すと
`?cursor=null` が飛び、`GET /walks` は 400 Invalid cursor を返す（SS-20）。

**How to apply:** optional/nullable なクエリを持つ生成エンドポイントには小さな param-builder
（例: `features/history/lib/walkHistoryParams.ts` の `buildWalkListParams`）を書き、意味のある値の
ときだけキーを設定する（`null` ではなくキー自体を省く）。テストで
`expect("cursor" in params).toBe(false)` を null/undefined/空文字について固定する。

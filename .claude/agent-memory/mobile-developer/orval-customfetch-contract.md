---
name: orval-customfetch-contract
description: Orval の react-query + fetch client は mutator が { status, data, headers } を返すことを前提に型生成する。src/api/client.ts の customFetch はこの契約に合わせる必要がある
metadata:
  type: project
---

## `customFetch` は生の本文ではなく `{ status, data, headers }` を返す契約

`orval.config.ts` の `client: "react-query"` + `httpClient: "fetch"` で生成されるエンドポイント関数
（例: `searchExplorePlaces`）は `Promise<{ data: T; status: 200 } & { headers: Headers } | ...エラー型>`
を返す型で生成される。生成コード自体は単に `return customFetch<...>(url, options)` するだけなので、
**mutator（`src/api/client.ts` の `customFetch`）側がこの形を返す責務を持つ**。

以前の実装は成功時にパース済みの本文をそのまま返しており（`res.data` が実行時 undefined になる）、
`health`/`spots` エンドポイントは未使用だったため気づかれていなかった。SS-15 で `/explore/places` を
初めて実利用する際に修正した（`packages/mobile/src/api/client.ts`）。

**How to apply**: 新しい Orval 生成エンドポイントを実際に呼ぶコードを書くときは、必ず
`response.status` で 200 を確認してから `response.data` を使う（narrowing のため）。
`customFetch` 自体は「2xxのみここに到達（非2xxは `ApiError` を throw）」という前提で
`{ status: response.status, data, headers: response.headers }` を返す。

参照実装: `packages/mobile/src/features/walk/api/exploreApi.ts`、
`packages/mobile/src/api/client.ts` / `client.test.ts`。

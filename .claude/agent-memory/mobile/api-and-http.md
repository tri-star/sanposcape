---
name: api-and-http
description: mobile の API 層と HTTP 出口の落とし穴 — customFetch の {status,data,headers} 契約、ApiError.body で原因分岐、Orval の void、redirect は RN で効かない、CloudFront 起因の症状の切り分け、404 読み替え関数で 422 を使う
metadata:
  type: feedback
  scope: durable
---

HTTP 出口が3つあること（`customFetch` / `authApi.ts` / S3 直送）と横断ヘッダーの付け方は `architecture-guideline.md`「送信側のヘッダー契約」と
`folder-structure.md`「`src/api/`」、再送の方針は ADR-005（棚卸し追補）、Orval の `cursor: null` は `folder-structure.md`「状態管理の使い分け」が正本。

## `customFetch` は `{ status, data, headers }` を返す

Orval（`client: "react-query"` + `httpClient: "fetch"`）の生成関数は `customFetch` の戻り値をそのまま返すだけなので、
**mutator 側がこの形を返す責務を持つ**（SS-15 で生の本文を返していたバグがあった）。2xx だけが到達し、非2xx は `ApiError` を throw する。

**How to apply:** 生成関数を呼ぶコードは `response.status` で絞り込んでから `response.data` を使う。参照実装: `features/walk/api/exploreApi.ts`。

## 同じステータスの原因分岐は `ApiError.body` → `getApiErrorCode()`

`customFetch` は非2xx の本文を JSON パースして（失敗時 `undefined`）`new ApiError(status, undefined, body)` に載せる。

**How to apply:** 新しい原因分岐が要るときは backend に機械可読な `code` を足してもらい、分類関数（例: `features/pin/lib/pinSaveError.ts`）で
`getApiErrorCode(cause)` を見る。`code` が無い・未知なら安全側の既定に倒す。`authApi.ts`（出口2）はこの仕組みの対象外。

## Orval: 本文スキーマが無いレスポンスは `data: void` になる

FastAPI が `responses={200: {"description": ...}}` だけを書き、実際は本文を返していると、生成型は `{ data: void; status: 200 }` になる。

**How to apply:** mobile 側で narrowing して使い、backend へ `model` の追記を依頼する。プランが「void なので narrowing」と書いていても、
生成物（`pnpm --filter mobile orval`）と `router.py` の現物で今の型を確かめる（既に直っていることがある）。

## `fetch` の `redirect` オプションは RN 実機で効かない

`whatwg-fetch` の `Request` は `redirect` を読まない。`redirect: "error"` / `"manual"` で守られていると考えない（`client.ts` / `presignedPostUpload.ts` の注記）。

## CloudFront 起因の壊れ方は症状で切り分ける

ヘッダーの付け忘れはローカル backend では発覚せず、`EXPO_PUBLIC_BACKEND_API_URL` を CloudFront へ向けた瞬間にまとめて出る。
- 全 API が 401 → 認証ヘッダー名（`X-App-Authorization`）
- 書き込み系だけ 403 → `x-amz-content-sha256`
- サインインだけできない → `authApi.ts` 側の付け忘れ

**How to apply:** 環境（localhost / CloudFront）でヘッダーを分岐させない。ユニットテストで固定できるのは「どの文字列をハッシュするか」「ヘッダー名・小文字16進」まで。
ヘッダーは2出口の両方に入れるが、再送は意図的に `client.ts` だけ。この非対称は両ファイルの JSDoc に理由を書く。

## 404 を成功に読み替える関数の中で 404 を投げない

`DELETE /walks/{id}` は非冪等で、404 は「既に無い」として成功扱いにする（ADR-003 決定13）。その関数の入口で非 UUID を弾くときに 404 を使うと
「失敗しているのに成功」になる。

**How to apply:** 読み替える関数の入口ガードには 422 を使う（`fetchWalkDetail` は 404 を使っているので流用しない）。

Related: [[hooks-and-query]], [[auth-and-session]]

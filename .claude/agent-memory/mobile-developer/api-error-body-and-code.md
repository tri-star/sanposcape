---
name: api-error-body-and-code
description: ApiError に body(JSON)を持たせ、409等の機械可読な code で分岐する拡張パターン(SS-88 PR#93 T15)
metadata:
  type: reference
  scope: durable
---

## 背景

`ApiError`（`src/api/apiError.ts`）は元々 `status` と `message` だけを持ち、本文を保持しなかった。
同じ HTTP ステータス（例: 409）が複数の原因（容量超過 / 写真準備未完了）から発生しうる場合、
呼び出し側は区別できなかった（SS-88 の M-R7、PR #93 の T15 で顕在化）。

## パターン

- backend が 409 等の応答本体に機械可読な `code` フィールドを追加する。
- `ApiError` のコンストラクタに第3引数 `body?: unknown` を追加する（**既存呼び出し側は
  そのまま**。`new ApiError(status)` / `new ApiError(status, message)` は互換）。
- `src/api/apiError.ts` に `getApiErrorCode(error: unknown): string | null` を追加し、
  `body.code` が文字列ならそれを返す（型ガード込みの薄いヘルパー）。
- `src/api/client.ts`（`customFetch`）の非2xx分岐で、応答本文を `response.text()` →
  `JSON.parse()`（失敗したら `undefined`）してから `throw new ApiError(status, undefined, body)`
  にする。`message` は既定のまま渡す（`undefined`）ことで、他 API のエラー処理
  （`error.message` を見ている箇所）を壊さない。
- 呼び出し側の分類関数（例: `pinSaveError.ts`）は `getApiErrorCode(cause)` で分岐し、
  `code` が無い・不明な値のときは既存の安全側デフォルトにフォールバックする。

## How to apply

新しい HTTP ステータスの原因分岐が必要になったら、まず backend に機械可読な `code` を
追加してもらい、mobile 側はこのパターン（`ApiError.body` → `getApiErrorCode`）を再利用する。
`src/services/auth/authApi.ts`（`customFetch` を使わない生 fetch の HTTP 出口。
[[mobile-two-http-exits]] 参照）は今回対象にしていない。認証エラーで同様の分類が必要になったら
そちらにも同じパターンを個別に適用する必要がある。

参照実装: `packages/mobile/src/api/apiError.ts`、`packages/mobile/src/api/client.ts`、
`packages/mobile/src/features/pin/lib/pinSaveError.ts`。

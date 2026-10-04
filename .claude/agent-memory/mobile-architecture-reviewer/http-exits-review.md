---
name: http-exits-review
description: mobile の backend 向け HTTP 出口は2箇所（customFetch / authApi）+ S3 直送。横断ヘッダーの付け忘れはローカルで発覚しないので毎回両方を確認し、3つ目の生 fetch が生えていないか grep する
metadata:
  type: feedback
  scope: durable
---

SS-70（CloudFront/SigV4 対応。`x-amz-content-sha256` と `X-App-Authorization`）のレビューで確立した確認事項。
決定の正本はルート `docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md`（SS-70 追補）と
`packages/mobile/adr/ADR-M-010-photo-service-and-direct-s3-upload.md`（S3 直送の出口）。

## backend 向けの出口は2箇所

`src/api/client.ts` の `customFetch`（Orval mutator）と、`src/services/auth/authApi.ts` の `post()`
（401→refresh の再帰を避けるため意図的に `customFetch` を経由しない生 fetch）。
横断的な変更（認証ヘッダー・署名ヘッダー等）は**両方**に入っているか必ず確認する。共有ロジックは `src/api/` の
独立モジュール（`contentHash.ts` / `authHeaders.ts`）に切り出して両方から import するのが確立したパターン。

S3 直送（presigned POST / GET）は**意図的な3つ目の出口**で、こちらには backend 向けの横断ヘッダー
（`X-App-Authorization` 等）を**付けてはいけない**（ADR-M-010）。

**Why:** 付け忘れはローカル backend では絶対に発覚せず、`EXPO_PUBLIC_BACKEND_API_URL` を CloudFront に向けた瞬間だけ
401/403 になる。生の `fetch` を `client.ts` / `authApi.ts` 以外で禁止する lint も無い。

**How to apply:**
- 横断ヘッダーに触る差分では、2つの出口の両方と S3 直送側（付けていないこと）を確認する。
- 毎回 `grep -rn "await fetch(\|= fetch\b" src/` 相当で、想定外の出口が増えていないか確認する。
- `src/api/` にネイティブモジュールを足す差分は、`architecture-guideline.md` の「`src/api/` 層は原則ネイティブ非依存だが、
  real/mock の分岐を持たない環境非依存な計算は例外」に当てはまるか、`vitest.config.ts` の `resolve.alias` に
  モックが足されているかを確認する。

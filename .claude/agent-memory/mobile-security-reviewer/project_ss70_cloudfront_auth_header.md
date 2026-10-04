---
name: project_ss70_cloudfront_auth_header
description: CloudFront経由のAPI通信(X-App-Authorization / x-amz-content-sha256)を触るPRのレビュー観点。決定と申し送り(リダイレクトで自動除去されない・ログ自動マスク対象外)の正本はADR-005決定4
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md
---

正本: `docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md` 決定4（SS-70 追補）。
アクセストークンは `Authorization` ではなく `X-App-Authorization: Bearer <token>` で運び、GET/HEAD 以外は
`x-amz-content-sha256` を送る。`X-App-Authorization` は非標準ヘッダーのため、クロスオリジンの
リダイレクトで自動除去されず、ログ・クラッシュレポートの自動マスク対象にもならない（ADR-005 の追補）。

SS-70 レビュー時の Medium（`fetch` の `redirect` 未指定）は、その後 `src/api/client.ts` と
`src/services/auth/authApi.ts` に `redirect: "error"` が入った。ただし RN 実機では `whatwg-fetch` が
`options.redirect` を読まないため実効的な防御ではない（コード注記あり）。backend がリダイレクトを
返さないことが実質の前提になっている。

**How to apply:** backend 向けの2出口（`client.ts` / `authApi.ts`）に触る PR では、
1. 両方が同時に更新されているか（片方だけだと認証系だけが壊れる）
2. 401→refresh→リトライ時にハッシュ計算済みの `signedOptions` を使い回しているか（ボディとハッシュの不整合）
3. `redirect: "error"` が外されていないか。外さないこと以上に、リダイレクトを返しうる backend 変更が
   無いかを見る
4. ロギング・クラッシュレポートを導入する PR では `X-App-Authorization` / `x-amz-content-sha256` を
   マスク対象に明示しているか
を確認する。S3 直送（3つ目の出口）は [[pin-and-route-param-review-checklist]]。

---
name: feedback_cloudfront_oac_authorization_header
description: CloudFront OAC(SigningBehavior=always) はビューアの Authorization を上書きする。Lambda Function URL 構成のプランでは認証ヘッダー名の設計を必ず含める
metadata:
  type: feedback
  scope: durable
  verify_by: 2027-03-31
---

**CloudFront の Origin Access Control で Lambda Function URL(AuthType=AWS_IAM) を保護する構成では、
CloudFront が SigV4 署名を `Authorization` ヘッダーに入れるため、ビューアが送った
`Authorization: Bearer <token>` は上書きされてオリジンに届かない。**

**Why:**
AWS 公式ドキュメント（Restrict access to an AWS Lambda function URL origin / Advanced settings）が
`SigningBehavior: always`（推奨設定）について「CloudFront always signs all requests it sends to the
Lambda function URL」と明記している。もう一方の `no-override` は「ビューア自身が Lambda URL ホストに
対する SigV4 署名を持つ」前提なので、IAM クレデンシャルを配れない public なモバイル/ブラウザ
クライアントでは成立しない。

**この不具合は `/health` のような認証不要エンドポイントでは絶対に露見しない。**
疎通確認（curl で 200 / 直叩き 403）を通過した後、クライアントを繋いだ瞬間に
「認証が必要な全エンドポイントが 401」という形で初めて発覚する。

**How to apply:**
- Lambda Function URL + CloudFront OAC を含むプランを書くときは、
  **認証トークンをどのヘッダーで運ぶか**を必ず設計判断の 1 項目として立てる。
  採った案: `X-App-Authorization` を新設し、backend は
  `X-App-Authorization` → `Authorization` の順で読むフォールバックにする
  （ローカル compose / CI / 既存テストは `Authorization` のまま緑に保てる）。
- 同時に **origin request policy がそのカスタムヘッダーを転送するか**をインフラ側に確認する。
  `AllViewerExceptHostHeader` 相当なら変更不要。
  **キャッシュポリシー（キャッシュキー）には入れないこと**（ユーザーごとにキャッシュが分裂する）。
- 併せて `AuthType=AWS_IAM` のもう一つの副作用（ボディを伴う POST/PUT/PATCH で
  クライアントが `x-amz-content-sha256` を送る必要がある）とセットで、
  クライアント側の総コストとして提示する。この 2 つを合算した上で
  `AuthType=NONE` + 共有シークレットヘッダー方式と比較させる
  （後者は両方の副作用が消える代わりに WAF を迂回した直叩きが成立する）。

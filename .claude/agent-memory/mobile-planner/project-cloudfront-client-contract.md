---
name: project-cloudfront-client-contract
description: mobile が backend へ送るヘッダーの契約（X-App-Authorization / x-amz-content-sha256）と、CloudFront(OAC) 起因の発覚が遅い failure mode
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md
---

backend は Lambda Function URL(`AuthType=AWS_IAM`) + CloudFront(OAC, `SigningBehavior: always`) に載っている。
このため mobile の HTTP 送出には 2 つの契約がある。

- **アクセストークンは `X-App-Authorization: Bearer <token>` で送る**（`Authorization` ではない）。
  CloudFront が自身の SigV4 署名を `Authorization` に入れるため、ビューアの値はオリジンに届かない。
  backend は `X-App-Authorization` → `Authorization` の順で読む（`packages/backend/src/sanposcape/auth/headers.py`、
  `HTTPBearer(auto_error=False)` なので `Authorization` 欠落でも 403 にならない）。
- **GET/HEAD 以外は `x-amz-content-sha256`（ボディの SHA-256・16進小文字）を送る**。
  CloudFront はボディのハッシュを計算せず、このヘッダーだけは上書きしない。無いと 403 `InvalidSignatureException`。
  空ボディ（DELETE 等）も空文字列のハッシュ `e3b0c442...` を送る。

**Why:** どちらも `GET /health` では絶対に露見せず、`EXPO_PUBLIC_BACKEND_API_URL` を CloudFront へ向けた瞬間に
「認証必須が全部 401」「書き込み系が全部 403」という形でまとめて発覚する。発見が遅い種類の破綻。

**How to apply:**
- API 層に触るプランでは、環境（localhost / CloudFront）で**ヘッダーを分岐させない**。経路差は発覚を遅らせる。
- 出口は 2 箇所（`src/api/client.ts` と `src/services/auth/authApi.ts`）。片方だけ直すとサインインが 403 になる（[[mobile-structure]]）。
- ローカル backend はこれらのヘッダーを無視するため、**値の正しさはローカルでは検証できない**。
  ユニットテストで固定できるのは「どの文字列をハッシュ対象に選ぶか」「ヘッダー名・小文字16進」まで。
- 症状からの切り分け: 全 API 401 → 認証ヘッダー名 / 書き込み系だけ 403 → content hash / サインイン不能 → authApi 側の付け忘れ。

Related: [[auth-scenarios]], [[project-rn-runtime-capabilities]]

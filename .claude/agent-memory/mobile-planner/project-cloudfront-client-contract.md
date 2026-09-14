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

## 再送してよい経路・いけない経路（dev の 429 / 504 対策を設計するとき）

dev の API Lambda は `ReservedConcurrentExecutions: 5`（6 本目から 429）、CloudFront のオリジン待ちは 30 秒（超過で 504）。
一時障害の再送を入れたくなるが、**安全なのは GET / HEAD だけ**である。

- **`POST /explore/*` の 429 は backend 自身のレート制限**（`maps/dependencies.py` が `HTTPException(429, "Explore request rate limit exceeded")`）。
  Lambda のスロットル由来の 429 と区別が付かず、再送は制限を悪化させるだけ。`useSpotCandidates` の `retry: false` は意図的（1 探索で外部呼び出し最大 21 回）。
- **`POST /auth/refresh` の再送はセッションを壊す。** backend はトークンをローテーションし、`used_at` 済みトークンの再提示を
  再利用検知として `revoke_family(..., "reuse_detected")` でファミリーごと失効させる（`auth/service.py`）。
  「サーバーは成功したがレスポンスが届かなかった」場合の再送で**強制サインアウト**になる。
- **`POST /walks` は `useWalkSave` が既にバックオフ再送を持つ**（最大 2 回 / `1000 * 2 ** n`、上限 8 秒）。transport 層で重ねない。

→ ヘッダー契約は「出口 2 箇所（`client.ts` / `authApi.ts`）を必ず**両方**直す」だが、
**再送は意図的に `client.ts` 側だけ**という非対称がある。両ファイルの JSDoc に理由を書かないと必ず取り違えられる。

Related: [[auth-scenarios]], [[project-rn-runtime-capabilities]]

---
name: project_ss70_cloudfront_auth_header
description: SS-70 CloudFront経由API通信対応（X-App-Authorization / x-amz-content-sha256）のレビュー要点
metadata:
  type: project
  scope: durable
  adr: docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md
---

SS-70（`tri-star/SS-70`）で mobile の HTTP 出口2箇所（`src/api/client.ts`, `src/services/auth/authApi.ts`）が
CloudFront(OAC, Lambda Function URL, AuthType=AWS_IAM) 経由に対応した。
- アクセストークンは `Authorization` ではなく `X-App-Authorization: Bearer <token>` で送る
  （CloudFrontがオリジンへの転送時に`Authorization`をSigV4署名で上書きするため。backendは
  `X-App-Authorization`→`Authorization`の優先順フォールバックで読む）。
- GET/HEAD以外は `x-amz-content-sha256`（ボディのSHA-256、16進小文字）を送る。付けないと403。
  空ボディは定数 `e3b0c442...`。UTF-8エンコード・小文字16進はiOS/Android/Web全ネイティブ実装で確認済み（正しい）。
- `client.ts` は401→refresh→リトライ時に `signedOptions`（ハッシュ計算済み）を使い回すため、
  ハッシュとボディの不整合は起きない設計。

**Why:** ADR-005（`docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md`）決定4の申し送り事項。
CloudFrontのキャッシュポリシーは `Managed-CachingDisabled` でキャッシュキーが空＝認証済みレスポンスの
キャッシュポイズニングは infra側で対処済み（mobile側の懸念ではない）。

**指摘した点（Medium）:** `fetch()` に `redirect` オプション未指定（デフォルト`"follow"`）。
標準の `Authorization` はクロスオリジンリダイレクトで自動的に削除される仕様があるが、
`X-App-Authorization` は非標準ヘッダーのためこの保護の対象外。現状バックエンドはリダイレクトを
返さないため即悪用不可だが、「発見が遅い破綻」パターン（ADR-005が繰り返し言及）に該当するため
`redirect: "error"` を明示することを推奨した。

**How to apply:** 今後この2出口（`client.ts`/`authApi.ts`）に触るPRでは、
(1) 両方が同時に更新されているか、(2) リトライ時にハッシュ計算を使い回しているか、
(3) `redirect` オプションが明示されているか、を確認する。
`X-App-Authorization` / `x-amz-content-sha256` は今後ロギング/クラッシュレポート導入時に
マスク対象ヘッダーへ追加が必要（`Authorization`前提の自動マスキングの対象外になるため）。

Related: [[project_ss10_token_clear_exception_safety]]

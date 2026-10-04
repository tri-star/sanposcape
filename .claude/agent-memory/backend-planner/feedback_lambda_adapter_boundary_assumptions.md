---
name: feedback-lambda-adapter-boundary-assumptions
description: 「プロセスで使い回す」「IP 単位で制限する」前提は Lambda アダプタ（Mangum）と CloudFront の境界で崩れやすい。TestClient のテストでは検出できない
metadata:
  type: feedback
  scope: durable
---

SS-183 で判明: mangum 0.22.0 の `lifespan="auto"` は呼び出しごとに startup/shutdown を回すため、
SS-67〜SS-183 の間 `_lifespan` の資源（Maps キャッシュ・ExploreRateLimiter・AppConfig セッション・S3 クライアント）は
Lambda で毎回作り直されていた。ADR-005 決定8 / ADR-008 D3 は「コールドスタートで1回」を前提に書かれていたが誰も境界で検証していなかった。
修正（init で lifespan を1回だけ起動、shutdown しない）は ADR-005 SS-183 追補、境界テストは `aws_lambda/tests/test_asgi_handler.py`。
既存テストは `with TestClient(app)`（lifespan 1回）なので検出できなかった。

あわせて: Function URL を CloudFront 経由で呼ぶ構成では `requestContext.http.sourceIp`（= Mangum の `request.client.host`）は
CloudFront の IP である疑いが強く、`X-Forwarded-For` は Function URL が左端（偽装可能）だけに切り詰めるとされる。
そうなら IP 単位のレート制限は利用者間で共有バケットになる（dev での確認と対処は SS-186。ADR-005 SS-183 追補）。

**Why:** ADR の「プロセス内で保持」「実行環境ごと」という記述は、アダプタの実装次第で成り立たない。TestClient は uvicorn 相当の lifespan を回すので Lambda の挙動を代弁しない。

**How to apply:**
- 実行環境で状態を保持する設計（キャッシュ・レート制限・セッション・known-good）をプランに書くときは、Lambda ハンドラーを2回以上呼ぶ境界テスト（`aws_lambda/tests/`）を完了条件に入れる。
- クライアント IP を使う機能をプランするときは、CloudFront 経由の IP の出所（CloudFront-Viewer-Address の転送有無など）を infra に確認する項目を入れる。

関連: [[feedback-cloudfront-oac-authorization-header]]、[[feedback-appconfig-feature-flag-gotchas]]

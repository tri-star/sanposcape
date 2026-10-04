---
name: feedback-otel-sqlalchemy-greenlet-and-adot-gotchas
description: OTel 計装を足したら実起動で DB ルートを叩く（SQLAlchemy 2.1 は greenlet 無しで計装が get_engine を落とす）。ADOT/Lambda 計装の属性の癖、DB 無しでの検証手段
metadata:
  type: feedback
  scope: durable
  verify_by: 2027-04-01
---

方針・構成の正は ADR-013（`docs/adr/ADR-013-observability-adot-application-signals.md`）。ここには実装時に踏みやすい罠だけを残す。

OTel の SQLAlchemy 計装は `instrument()` の中で `sqlalchemy.ext.asyncio` を import する。SQLAlchemy 2.1 は greenlet を既定の依存にしないため、`sqlalchemy[asyncio]` を runtime 依存にしないと ImportError で `get_engine()` が落ち、DB を使う全ルートが 500 になる。

**Why:** DB 無しの単体テストでは検出できず、`opentelemetry-instrument` でローカル起動して DB ルートを叩いて初めて発覚した（SS-178）。
**How to apply:** 計装を足したら「実起動 + 実際に DB へ届くルート」を必ず 1 回叩く。計装関数は例外を握って WARNING に倒し、トレースでアプリを落とさない。

- ADOT 同梱の Lambda 計装（payload 2.0）は `http.target` に `path?rawQueryString`、`http.route` に生のパスを入れる。フックが無いので、Mangum に渡す ASGI app を包んで current span を書き換える（`aws_lambda/tracing.py`）。
- fastapi 計装 0.65b0 は、スパン名 `METHOD route_template` と `http.route` を自分で付ける（自前のルート解決ミドルウェアは不要）。
- テスト内で `Settings()` から DB の URL を組み立てると、conftest の環境変数の隔離で既定値（host=db）になり、CI（DB_HOST=localhost）だけで落ちる。`test_engine.url` を使う（[[feedback-test-settings-env-and-auth-mode]]）。
- `pytest --noconftest` で DB 不要のテストだけ回せる（conftest の session autouse が DB を要求するため）。ただし DB 込みの全体実行の代わりにはならない。
- sandbox からは docker の公開ポートへ接続できない。OTLP の受信は sandbox 内の自前 HTTP サーバーで確認する。

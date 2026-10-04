---
name: feedback-otel-sqlalchemy-greenlet-and-adot-gotchas
description: OTel SQLAlchemy計装はSQLAlchemy 2.1でgreenlet必須（無いとget_engineが落ちる）。ADOT/Lambda計装のhttp.route・http.targetの癖、DB無し環境での検証手段（SS-178）
metadata:
  type: feedback
---

OTel の SQLAlchemy 計装は `instrument()` 内で `sqlalchemy.ext.asyncio` を import する。SQLAlchemy 2.1 は greenlet を既定依存にしないため、`sqlalchemy[asyncio]` を runtime 依存にしないと ImportError で `get_engine()` が落ち全 DB ルートが 500 になる。

**Why:** DB 無しの単体テストでは検出できず、`opentelemetry-instrument` でローカル起動して DB ルートを叩いて初めて発覚した（SS-178）。
**How to apply:** 計装を足したら「実起動 + 実際に DB へ届くルート」を必ず1回叩く。計装関数は例外を握って WARNING に倒し、トレースでアプリを落とさない。
- ADOT 同梱の Lambda 計装(payload 2.0)は `http.target` に `path?rawQueryString`、`http.route` に生パスを入れる。親スパン補正は Mangum に渡す ASGI app を包んで current span を書き換える。fastapi計装 0.65b0 は既にスパン名 `METHOD route_template` と `http.route` を付ける。
- `pytest --noconftest` で DB 不要のテストだけ回せる（conftest の session autouse が DB を要求するため）。ただし `.env` 無しでの本番テスト実行の代替ではない。
- sandbox から docker 公開ポートへの接続は不可。OTLP 受信は sandbox 内の自前 HTTP サーバーで確認。

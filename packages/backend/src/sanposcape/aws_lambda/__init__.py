"""AWS Lambda 固有のコードはこのパッケージにのみ置く。

ECS へ移す際はこのパッケージを使わないだけでよい（`main.py` の `create_app()` / `app` は
このパッケージから独立しており、ECS では従来どおり `uvicorn sanposcape.main:app` で動く）。
この制約は「`sanposcape.aws_lambda` を、パッケージの外（`core/` や各ドメイン）から
import していないこと」を grep で機械的に検査できる（`template.yaml` の `Handler` 指定と
自身の `tests/` は対象外。パッケージ内のモジュール同士、例えば `api.py` → `tracing.py` は
import し合ってよい。`aws_lambda/` から `core/` を import する向きも許す）
（docs/adr/ADR-005-backend-serverless-deployment-lambda-function-url.md 決定3）。
"""

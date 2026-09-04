"""AWS Lambda 固有のコードはこのパッケージにのみ置く。

ECS へ移す際はこのパッケージを使わないだけでよい（`main.py` の `create_app()` / `app` は
このパッケージから独立しており、ECS では従来どおり `uvicorn sanposcape.main:app` で動く）。
この制約は「`sanposcape.aws_lambda` を import しているのが `template.yaml` と自身の
`tests/` だけであること」を grep で機械的に検査できる（tmp/SS-67/backend-plan.md 決定8）。
"""

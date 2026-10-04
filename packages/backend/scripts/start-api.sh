#!/bin/sh
# api コンテナの起動コマンド（compose.yaml の `command`。Dockerfile の CMD は変えていない）。
#
# TRACING_ENABLED=true のときだけ `opentelemetry-instrument` 経由で起動する（ADR-013 決定7・8）。
# TracerProvider とエクスポーターの構成は、アプリ（core/observability.py）ではなく
# この起動ラッパーが担う（Lambda では ADOT レイヤーの AWS_LAMBDA_EXEC_WRAPPER が同じ役割）。
# 既定（無効）は従来どおり uvicorn を直接起動する。
#
# `exec` で uvicorn に置き換えるのは、シグナル（docker stop の SIGTERM）を uvicorn が
# 直接受けるようにするため。
set -eu

if [ "${TRACING_ENABLED:-false}" = "true" ]; then
  exec opentelemetry-instrument uvicorn sanposcape.main:app --host 0.0.0.0 --port 8000 --reload
fi

exec uvicorn sanposcape.main:app --host 0.0.0.0 --port 8000 --reload

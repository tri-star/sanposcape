# syntax=docker/dockerfile:1
FROM python:3.12-slim

# uv を公式イメージからコピー（公式推奨の方法）
COPY --from=ghcr.io/astral-sh/uv:0.7.13 /uv /uvx /bin/

ENV UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# 依存だけ先に解決してレイヤーキャッシュを効かせる
COPY pyproject.toml uv.lock* ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --no-install-project --dev

# アプリ本体をコピー
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --dev

EXPOSE 8000

CMD ["uvicorn", "sanposcape.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

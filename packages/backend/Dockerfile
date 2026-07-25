# syntax=docker/dockerfile:1
FROM python:3.12-slim

ARG APP_UID=1000
ARG APP_GID=1000

# uv を公式イメージからコピー（公式推奨の方法）
COPY --from=ghcr.io/astral-sh/uv:0.7.13 /uv /uvx /bin/

ENV UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/app/.venv \
    UV_CACHE_DIR=/home/app_user/.cache/uv \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

RUN set -eux; \
    case "${APP_UID}" in ''|*[!0-9]*|0) echo "APP_UID must be a positive integer: ${APP_UID}" >&2; exit 1 ;; esac; \
    case "${APP_GID}" in ''|*[!0-9]*|0) echo "APP_GID must be a positive integer: ${APP_GID}" >&2; exit 1 ;; esac; \
    if getent passwd "${APP_UID}" > /dev/null; then \
      echo "APP_UID ${APP_UID} is already assigned; choose an unused UID" >&2; exit 1; \
    fi; \
    if getent group "${APP_GID}" > /dev/null; then \
      app_group="$(getent group "${APP_GID}" | cut -d: -f1)"; \
    else \
      app_group=app_user; \
      groupadd --gid "${APP_GID}" "${app_group}"; \
    fi; \
    useradd --uid "${APP_UID}" --gid "${APP_GID}" --create-home --home-dir /home/app_user --shell /usr/sbin/nologin app_user; \
    install -d --owner "${APP_UID}" --group "${APP_GID}" /app /home/app_user/.cache/uv

WORKDIR /app

# 依存だけ先に解決してレイヤーキャッシュを効かせる
COPY --chown=${APP_UID}:${APP_GID} pyproject.toml uv.lock* ./
USER app_user
RUN --mount=type=cache,target=/home/app_user/.cache/uv,uid=${APP_UID},gid=${APP_GID} \
    uv sync --no-install-project --dev

# アプリ本体をコピー
COPY --chown=${APP_UID}:${APP_GID} . .
RUN --mount=type=cache,target=/home/app_user/.cache/uv,uid=${APP_UID},gid=${APP_GID} \
    uv sync --dev

EXPOSE 8000

CMD ["uvicorn", "sanposcape.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

---
name: project-ss88-observability-log-review
description: SS-88 followup (4d7f8f8..HEAD, tri-star/ss-88-photo-upload-fix) — AccessLogMiddleware + pins/service.py upload-issue log review outcome, no findings.
metadata:
  type: project
  scope: task-local
  source_issue: SS-88
---

Reviewed 2026-09-24 on branch `tri-star/ss-88-photo-upload-fix` (`git diff 4d7f8f8..HEAD --
packages/backend`). Added `core/observability.py` (`AccessLogMiddleware` + `configure_logging`)
and a log line in `pins/service.py::PinPhotoUploadService.create_upload`.

- **Outcome**: no Critical/High/Medium/Low. Focus was "does logging leak anything" per caller's
  request — verified rather than assumed:
  - `AccessLogMiddleware` logs only `method` / `scope["path"]` / status / elapsed ms — no query
    string, no headers, no body, no exception object on the 500 re-raise path (confirmed by
    reading `_log()` and the `except Exception: self._log(...); raise` shape).
  - Walked every router's path patterns (`pins`, `pin-photo-uploads`, `walks`, `auth`,
    `auth/dev_router`, `sanpo_maps`, `maps`, `users`, `app_config`, `health`) — all path params
    are `uuid.UUID`; every token-bearing field (id_token, refresh_token, access_token, cursor) is
    body or query, never path. So `scope["path"]` logging is currently safe, but this is a
    manual-verification result, not an enforced invariant — re-check this each time a new router
    is added (nothing stops a future endpoint from putting a token in the path).
  - `pins/service.py` upload-issued log: only `upload_id` (server UUID4), `key` (server-built via
    `photo_keys.py::staging_key`, no client input), `content_type` (schema-constrained
    `Literal["image/jpeg"]`, not free text — no log-injection surface), `declared_byte_size`,
    `max_bytes`, storage class name. Verified `form.fields` (boto3 `generate_presigned_post`
    output — policy/signature/temp STS token) is genuinely never logged, by reading
    `integrations/aws/s3.py::S3ObjectStorage.create_upload_form`.
  - `config.py` `log_level` validator only uppercases before the `Literal` check — value space
    unchanged, not a validation-loosening.
  - `compose.yaml` AWS_* passthrough defaults to empty string; `.env` is gitignored at both repo
    root and `packages/backend/`; `.env.example` only has a `<account_id>` placeholder + explicit
    "don't write real creds here, eval `aws configure export-credentials`" guidance — no new
    credential-commit path.
- **New durable pattern for this repo**: request-level access logging via a raw ASGI middleware
  (not `BaseHTTPMiddleware`) registered *last* in `create_app()` so it's outermost and observes
  `RequestSizeLimitMiddleware`'s self-handled 413s. `configure_logging()` deliberately avoids
  adding a handler when root already has one (Lambda runtime already attaches one) — worth
  knowing if a future change touches Lambda logging setup.

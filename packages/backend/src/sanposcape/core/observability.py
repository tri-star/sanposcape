"""可観測性（ログ・アクセスログ・トレース）の公開名の再エクスポート。

実体は `core/logs.py`（ログの構造化）・`core/access_log.py`（`AccessLogMiddleware`）・
`core/tracing.py`（OpenTelemetry の計装。最下層）にある。import 先を変えずに済ませるための
ファサードで、新しいコードもここから import してよい（ADR-013 決定7 の SS-181 追補）。

private 名（`_LOG_OPTIONS` / `_WARNED` / `_MAX_*` など）は再エクスポートしない。再エクスポートした
名前を monkeypatch しても実体のモジュールのグローバルは変わらないため、テストは実体のモジュールを
直接 patch する。
"""

from sanposcape.core.access_log import AccessLogMiddleware, UnhandledErrorAfterResponseStart
from sanposcape.core.logs import (
    ConsoleLogFormatter,
    JsonLogFormatter,
    LogContext,
    bind_log_user_id,
    configure_logging,
    log_context,
)
from sanposcape.core.tracing import (
    TraceLookup,
    blank_privacy_sensitive_attributes,
    instrument_fastapi_app,
    instrument_sqlalchemy_engine,
    record_exception_on_current_span,
    resolve_route_template,
    warn_once,
)

__all__ = [
    "AccessLogMiddleware",
    "ConsoleLogFormatter",
    "JsonLogFormatter",
    "LogContext",
    "TraceLookup",
    "UnhandledErrorAfterResponseStart",
    "bind_log_user_id",
    "blank_privacy_sensitive_attributes",
    "configure_logging",
    "instrument_fastapi_app",
    "instrument_sqlalchemy_engine",
    "log_context",
    "record_exception_on_current_span",
    "resolve_route_template",
    "warn_once",
]

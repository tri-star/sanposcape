"""リクエスト単位の可観測性（ログ設定とアクセスログ）。

**なぜ必要になったか**: SS-88/SS-106 の実機確認で写真アップロードが失敗した際、
CloudWatch Logs には `START`/`END`/`REPORT` しか残っておらず、「枠発行
（`POST /pin-photo-uploads`）が 201 だったのか 401 だったのか」すら分からなかった。
結局 CloudFront の `4xxErrorRate` メトリクスから推測するしかなく、切り分けに時間を要した。
ローカル（uvicorn）は uvicorn 自身がアクセスログを出すため気付きにくいが、
Lambda（Mangum）には uvicorn が居ないので**アプリ側で出さない限り何も残らない**。

`RequestSizeLimitMiddleware`（`core/middleware.py`）と同じく素の ASGI ミドルウェアとして
書く（BaseHTTPMiddleware を使わない = ストリーミング応答やバックグラウンドタスクの
挙動を変えない）。

---

**ログの構造化（ADR-013 決定3 の SS-180 追補）** は「ログ」の節にある。要点:

- 出力は 1 レコード 1 行の JSON（`JsonLogFormatter`。依存なし）。ローカルは `LOG_FORMAT=console`。
- `trace_id` / `span_id`（トレース有効時）、Lambda の `aws_request_id`、`http_method` /
  `http_route`、認証済みなら `user_id`（内部 UUID）を付ける。
- **例外メッセージは local / test でしか出さない**（ADR-013 決定6: メッセージ経由の漏れを塞ぐ）。
- 未処理例外は `AccessLogMiddleware` が 1 回だけ ERROR にして 500 を返す（再送出しない）。

**トレース（OpenTelemetry。ADR-013 / SS-178）** はこのファイル末尾の独立したセクションにある。
要点:

- **TracerProvider はここでは作らない**（決定7）。Lambda は ADOT レイヤー、ローカルは
  `opentelemetry-instrument`（scripts/start-api.sh）が起動時に作る。ここは「計装を掛ける」だけ。
- 有効化は `Settings.tracing_enabled`（既定 False）。無効なとき、また OTel を import できない
  環境（Lambda の zip には入れない。dev グループ）では、何もしない（import すらしない）。
- **外へ出さない情報（決定6）**: クエリ文字列・ヘッダー・ボディ・SQL のバインド値。
  OTel の ASGI 計装の旧 semconv は `http.url` にクエリ込みの URL を入れるため、フックで除いている。
  `OTEL_SEMCONV_STABILITY_OPT_IN` でオプトインするときは `url.query` / `url.full` も同様に
  除くこと（今は使わない。ADOT の Application Signals が旧 semconv しか読まないため）。
"""

from __future__ import annotations

import contextlib
import json
import logging
import time
import traceback
from collections.abc import Callable, Iterator
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any
from urllib.parse import urlsplit, urlunsplit

from starlette.responses import PlainTextResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

if TYPE_CHECKING:
    from fastapi import FastAPI
    from sqlalchemy.engine import Engine

    from sanposcape.config import Settings

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# ログ（ADR-013 決定3 の SS-180 追補）
# ---------------------------------------------------------------------------
# ★ 文脈（ContextVar・current span）は **format の時点で読む**。そのためログのハンドラーは
#   「emit と同じスレッド・同じ context で format する同期のもの」に限る。`QueueHandler` などの
#   非同期のハンドラーを入れるときは、`LogRecord` に文脈を載せる方式へ見直すこと。
# ★ ThreadPoolExecutor のワーカー（maps/service.py の周回ルート、photo_attacher.py の S3 Copy）の
#   中のログには `LogContext` が付かない（ContextVar は新しいスレッドへ伝わらない）。OTel の
#   threading 計装は OTel の context だけを運ぶので `trace_id` / `span_id` は付く。

# 例外のスタックトレースの行数の上限（超えたら**先頭側を省いて**末尾を残し、
# `exception_stacktrace_truncated`）。送出箇所と最終例外の型名は末尾にあるため。
_MAX_STACKTRACE_LINES = 200
# `__cause__` / `__context__` の連鎖をたどる段数の上限（外側 = 新しい例外から数える。
# 超えたら原因側の古い例外を省く）。
_MAX_EXCEPTION_CHAIN = 20
# `message` の長さ（文字数）の上限。超えたら切り詰めて `message_truncated: true`。
_MAX_MESSAGE_CHARS = 16_000
# 1 行（1 ログイベント）の大きさ（UTF-8 のバイト数）の上限。CloudWatch Logs は 1 イベント
# 256KB までで、超えると分割・拒否される。余裕を持たせた値で、超えたらスタックトレースを落とす。
_MAX_LOG_LINE_BYTES = 200_000
# `extra=` で渡されたもののうち、JSON に出してよいキー（許可リスト）。ライブラリが付けた想定外の
# 属性を黙って出さない。
_EXTRA_KEYS = ("log_type", "http_status_code", "duration_ms")


@dataclass(slots=True)
class LogContext:
    """1 リクエスト（Lambda では 1 呼び出し）の間、ログに付ける文脈。

    ★ ContextVar には**この可変オブジェクト**を入れ、値は属性の書き換えで更新する。同期の依存
    （`_authenticate_access_token`）は anyio のスレッドプールで動き、そこでの `ContextVar.set` は
    呼び出し元に戻らない（context がコピーされるため）。コピーされた context も同じオブジェクトを
    指すので、属性の書き換えなら届く。
    """

    aws_request_id: str | None = None
    http_method: str | None = None
    http_route: str | None = None
    user_id: str | None = None
    # `http_route` は routing の後でないと決まらないため、format の時点で解決する。
    scope: Scope | None = None


_log_context: ContextVar[LogContext | None] = ContextVar("sanposcape_log_context", default=None)
# format 中に `resolve_route_template()` が出すログで再帰しないためのガード。
_formatting: ContextVar[bool] = ContextVar("sanposcape_log_formatting", default=False)


@contextlib.contextmanager
def log_context(**fields: Any) -> Iterator[LogContext]:
    """`LogContext` を用意する。既にあれば項目を書き足すだけ（reset は作った側が行う）。

    `None` の値は書き込まない（既にある値を消さない）。
    """
    current = _log_context.get()
    if current is not None:
        _fill_log_context(current, fields)
        yield current
        return
    created = LogContext()
    _fill_log_context(created, fields)
    token = _log_context.set(created)
    try:
        yield created
    finally:
        _log_context.reset(token)


def _fill_log_context(target: LogContext, fields: dict[str, Any]) -> None:
    for key, value in fields.items():
        if value is not None:
            setattr(target, key, value)


def bind_log_user_id(user_id: object) -> None:
    """認証で確定したユーザー ID（内部 UUID）を、現在のリクエストのログに付ける。

    `LogContext` が無ければ何もしない。呼ぶのは `dependencies.py` の認証の成功時だけ。
    """
    current = _log_context.get()
    if current is not None:
        current.user_id = str(user_id)


TraceLookup = Callable[[], "tuple[str, str, bool] | None"]


@dataclass(slots=True)
class _LogOptions:
    """フォーマッターが format のたびに読むモジュール単位の設定。

    Lambda では `Settings` が確定する前（`api.py` の先頭）にフォーマッターを差し替えるため、
    フォーマッター自身は設定を持たず、後から `configure_logging()` が更新するここを読む。
    既定は安全側（例外メッセージを出さない・トレースを見ない）。
    """

    include_exception_messages: bool = False
    trace_lookup: TraceLookup | None = None


_LOG_OPTIONS = _LogOptions()


def _build_trace_lookup() -> TraceLookup | None:
    """current span から `(trace_id, span_id, sampled)` を取る関数を返す。

    OTel を import するのは `tracing_enabled=True` のときだけ（無効時は import しない契約。
    ADR-013 決定7）。import できなければ None（トレースの項目を出さない）。
    """
    try:
        from opentelemetry import trace
    except ImportError as exc:
        _warn_tracing_unavailable(exc)
        return None

    def lookup() -> tuple[str, str, bool] | None:
        context = trace.get_current_span().get_span_context()
        if not context.is_valid:
            return None
        return (
            format(context.trace_id, "032x"),
            format(context.span_id, "016x"),
            bool(context.trace_flags.sampled),
        )

    return lookup


def _qualified_type_name(exc: BaseException) -> str:
    cls = type(exc)
    if cls.__module__ == "builtins":
        return cls.__qualname__
    return f"{cls.__module__}.{cls.__qualname__}"


def _sqlstate_of(exc: BaseException) -> str | None:
    """DB 例外の SQLSTATE（`exc.orig.sqlstate` または `pgcode`）。スパンとログで共用する。"""
    orig = getattr(exc, "orig", exc)
    sqlstate = getattr(orig, "sqlstate", None) or getattr(orig, "pgcode", None)
    return str(sqlstate) if sqlstate else None


def _exception_chain(exc: BaseException) -> list[BaseException]:
    """古い（原因側の）例外から順に並べた連鎖。`__suppress_context__` を尊重し、循環に備える。"""
    chain: list[BaseException] = []
    seen: set[int] = set()
    current: BaseException | None = exc
    while current is not None and id(current) not in seen and len(chain) < _MAX_EXCEPTION_CHAIN:
        seen.add(id(current))
        chain.append(current)
        if current.__cause__ is not None:
            current = current.__cause__
        elif not current.__suppress_context__:
            current = current.__context__
        else:
            current = None
    chain.reverse()
    return chain


def _render_stacktrace(exc: BaseException) -> tuple[list[str], bool]:
    """スタックトレースを行のリストにする。各例外は**型名だけ**の行（メッセージは入れない）。

    フレームはファイル・行番号・関数名・ソースの行（コードであって実行時の値ではない）。
    ローカル変数は出さない。上限を超えたら**先頭側を省いて末尾を残す**（送出箇所と最終例外の
    型名が末尾にあるため）。省いたことは先頭の 1 行（`... (N lines omitted)`）で示す。
    """
    lines: list[str] = []
    chain = _exception_chain(exc)
    for index, item in enumerate(chain):
        if index > 0:
            if item.__cause__ is chain[index - 1]:
                lines.append("The above exception was the direct cause of the following exception:")
            else:
                lines.append("During handling of the above exception, another exception occurred:")
        lines.append("Traceback (most recent call last):")
        for frame in traceback.extract_tb(item.__traceback__).format():
            lines.extend(line.rstrip() for line in frame.splitlines())
        lines.append(_qualified_type_name(item))
    if len(lines) > _MAX_STACKTRACE_LINES:
        kept = max(_MAX_STACKTRACE_LINES - 1, 0)
        omitted = len(lines) - kept
        return [f"... ({omitted} lines omitted)", *lines[len(lines) - kept :]], True
    return lines, False


def _render_exception(exc: BaseException, *, include_message: bool) -> dict[str, Any]:
    """`exc_info` を JSON の項目にする。メッセージは `include_message` のときだけ。"""
    fields: dict[str, Any] = {"exception_type": _qualified_type_name(exc)}
    stacktrace, truncated = _render_stacktrace(exc)
    fields["exception_stacktrace"] = stacktrace
    if truncated:
        fields["exception_stacktrace_truncated"] = True
    sqlstate = _sqlstate_of(exc)
    if sqlstate:
        fields["exception_sqlstate"] = sqlstate
    if include_message:
        fields["exception_message"] = str(exc)
    return fields


def _context_fields() -> dict[str, Any]:
    """リクエストの文脈とトレースの項目（値が無いものは含めない）。format の時点で読む。"""
    fields: dict[str, Any] = {}
    context = _log_context.get()
    if context is not None:
        if context.http_route is None and context.scope is not None and not _formatting.get():
            token = _formatting.set(True)
            try:
                context.http_route = resolve_route_template(context.scope)
            except Exception:
                pass
            finally:
                _formatting.reset(token)
        for key in ("aws_request_id", "http_method", "http_route", "user_id"):
            value = getattr(context, key)
            if value is not None:
                fields[key] = value
    lookup = _LOG_OPTIONS.trace_lookup
    if lookup is not None:
        try:
            found = lookup()
        except Exception:
            found = None
        if found is not None:
            fields["trace_id"], fields["span_id"], fields["trace_sampled"] = found
    return fields


class JsonLogFormatter(logging.Formatter):
    """1 レコード 1 行の JSON にする（キーは snake_case。値が無い項目は出さない）。

    - 常に: `timestamp`（UTC・ミリ秒・`Z` 終わり）/ `level` / `logger` / `message`
      （長すぎる `message` は切り詰めて `message_truncated: true`。1 行が大きすぎるときは
      スタックトレースを落とす。CloudWatch の 1 イベントは 256KB まで）
    - 文脈: `aws_request_id` / `http_method` / `http_route` / `user_id`（`LogContext`）、
      `trace_id` / `span_id` / `trace_sampled`（トレース有効で current span が有効なとき）
    - `extra=` は `_EXTRA_KEYS` の許可リストだけ（アクセスログの `log_type` など）
    - `exc_info` があるとき: `exception_type` / `exception_stacktrace` / `exception_sqlstate`。
      **`exception_message` は `include_exception_messages` のとき（local / test）だけ**
      （メッセージ経由で psycopg の DETAIL・検証エラーの入力値・URL が残るため。決定6）。

    **例外を投げない**: 失敗したら最小限の JSON（`message: "log formatting failed"`）に倒す。
    設定は `_LOG_OPTIONS` を format のたびに読む（Lambda では `Settings` 確定前に差し替えるため）。
    """

    def format(self, record: logging.LogRecord) -> str:
        try:
            payload = self._payload(record)
            line = self._dumps(payload)
            if (
                len(line.encode("utf-8")) > _MAX_LOG_LINE_BYTES
                and "exception_stacktrace" in payload
            ):
                # CloudWatch の 1 イベントの上限対策。まずスタックトレースを落とす。
                payload["exception_stacktrace"] = ["... (omitted: log line too large)"]
                payload["exception_stacktrace_truncated"] = True
                line = self._dumps(payload)
            return line
        except Exception as exc:
            return self._fallback(record, exc)

    @staticmethod
    def _dumps(payload: dict[str, Any]) -> str:
        return json.dumps(payload, ensure_ascii=False, default=str, separators=(",", ":"))

    def _payload(self, record: logging.LogRecord) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "timestamp": self._timestamp(record),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if len(payload["message"]) > _MAX_MESSAGE_CHARS:
            payload["message"] = payload["message"][:_MAX_MESSAGE_CHARS]
            payload["message_truncated"] = True
        for key in _EXTRA_KEYS:
            if key in record.__dict__:
                payload[key] = record.__dict__[key]
        payload.update(_context_fields())
        exc_info = record.exc_info
        if exc_info and exc_info[1] is not None:
            payload.update(
                _render_exception(
                    exc_info[1], include_message=_LOG_OPTIONS.include_exception_messages
                )
            )
        return payload

    @staticmethod
    def _timestamp(record: logging.LogRecord) -> str:
        created = datetime.fromtimestamp(record.created, UTC)
        return created.strftime("%Y-%m-%dT%H:%M:%S.") + f"{int(record.msecs):03d}Z"

    @staticmethod
    def _fallback(record: logging.LogRecord, failure: BaseException) -> str:
        return json.dumps(
            {
                "level": record.levelname,
                "logger": record.name,
                "message": "log formatting failed",
                "exception_type": type(failure).__name__,
            },
            ensure_ascii=False,
        )


class ConsoleLogFormatter(logging.Formatter):
    """ローカル用の読みやすい 1 行表記（`LOG_FORMAT=console`。local / test だけ許可）。

    例: `12:34:56.789 INFO  sanposcape.core.observability: GET /pins -> 200 (1.2ms)
    [http_method=GET http_route=/pins]`（文脈の項目は JSON と同じキー名・順）。
    例外は標準のトレースバック（メッセージ込み。local / test だけなので決定6 と矛盾しない）。
    """

    def format(self, record: logging.LogRecord) -> str:
        clock = time.strftime("%H:%M:%S", time.localtime(record.created))
        line = (
            f"{clock}.{int(record.msecs):03d} {record.levelname:<5} "
            f"{record.name}: {record.getMessage()}"
        )
        context = _context_fields()
        if context:
            line += " [" + " ".join(f"{key}={value}" for key, value in context.items()) + "]"
        if record.exc_info and record.exc_info[1] is not None:
            line += "\n" + self.formatException(record.exc_info)
        return line


# `configure_logging()` が足したハンドラーの目印（2 回目以降はフォーマッターだけ差し替える）。
_OWNED_HANDLER_ATTR = "_sanposcape_owned"


def configure_logging(
    level: str,
    *,
    log_format: str = "json",
    tracing_enabled: bool = False,
    include_exception_messages: bool = False,
) -> None:
    """`sanposcape.*` のログを `level` 以上で出力できるようにし、フォーマットを設定する。

    ★ ハンドラーを足す条件に注意:
    - Lambda の python ランタイムは **root logger にハンドラーを付ける**ので、ここでは
      レベルだけ設定すれば伝播で出力される（ハンドラーを足すと二重に出る）。ランタイムの
      ハンドラーのフォーマッターは `aws_lambda/runtime_logging.py` が JSON に差し替える。
    - uvicorn は自分の（`uvicorn.*`）ロガーしか設定せず root は手付かずなので、
      レベルだけ設定しても `logging.lastResort`（WARNING 相当）止まりで INFO が消える。
      そのため root にもこのロガーにもハンドラーが無いときだけ1つ足す。

    `create_app()` から呼ぶ。複数回呼ばれてもハンドラーは増えない（足したハンドラーには
    目印を付け、2 回目以降はフォーマッターだけを `log_format` に合わせて差し替える）。
    root のハンドラー（Lambda・pytest）には触れない。

    `tracing_enabled` が True のときだけ OTel を（関数内で）import し、`trace_id` などを付ける。
    `include_exception_messages` は例外メッセージを JSON に出すか（local / test だけ True）。
    """
    app_logger = logging.getLogger("sanposcape")
    app_logger.setLevel(level)
    _LOG_OPTIONS.include_exception_messages = include_exception_messages
    formatter: logging.Formatter = (
        ConsoleLogFormatter() if log_format == "console" else JsonLogFormatter()
    )
    for existing in app_logger.handlers:
        if getattr(existing, _OWNED_HANDLER_ATTR, False):
            existing.setFormatter(formatter)
    if not logging.getLogger().handlers and not app_logger.handlers:
        handler = logging.StreamHandler()
        handler.setFormatter(formatter)
        setattr(handler, _OWNED_HANDLER_ATTR, True)
        app_logger.addHandler(handler)
    # ★ ハンドラーとフォーマッターを確定させてから作る。OTel を import できないときの警告が、
    #   ハンドラーの無いローカルの経路で `logging.lastResort`（プレーンテキスト）に落ちないように。
    _LOG_OPTIONS.trace_lookup = _build_trace_lookup() if tracing_enabled else None


class UnhandledErrorAfterResponseStart(Exception):  # noqa: N818
    """応答の開始後に未処理例外が出たことを、サーバー（Mangum / uvicorn）に伝えるための例外。

    メッセージも原因（`__cause__`）も持たない（`raise ... from None`）。元の例外のメッセージが
    Mangum の `logger.exception` 経由でログに残る抜け道を作らないため。
    """


class AccessLogMiddleware:
    """1リクエストにつき1行、`method path -> status (N.Nms)` を出す（JSON では下記の項目つき）。

    `extra` で `log_type="access"` / `http_status_code` / `duration_ms` を付ける。
    レベル: 未処理例外 → ERROR（`exc_info` つき）/ 例外ハンドラーで変換した 5xx（503 など）→
    WARNING（発生元が既に ERROR を出している場合があり、二重の ERROR にしない）/ それ以外 INFO。

    意図的に出さないもの:
    - **クエリ文字列**（将来トークン等が載ったときに黙って漏れる経路を作らない）
    - **ヘッダー・ボディ**（同上）

    ★ 逆に言うと **`path` は無条件に `message` に出す**（`http_route` はテンプレートなので安全）。
    現在のルートのパスパラメータは UUID だけで、トークン類はすべてリクエストボディで受けて
    いるのでこれで安全だが、この性質を機械的にチェックする仕組みは無い。**パスに秘密を載せる
    ルート**（例: メール内リンクのワンタイムトークンを `/xxx/{token}` で受ける）を追加するときは、
    ここを `exclude_paths` に足すか、パスをマスクしてから出すかを必ず検討すること
    （SS-88 のセキュリティレビューの申し送り）。

    `exclude_paths` は既定で `/health` を除く。docker compose のヘルスチェックが 5 秒ごとに
    叩くため、入れておかないとローカルのログが健康診断で埋まる（成功時のアクセスログだけを
    省く。例外は `/health` でも捕まえて ERROR にする）。

    **未処理例外はここで握り、自分で 500 を返す（再送出しない。SS-180 / ADR-013 決定6）**:
    - ERROR が自分の 1 件だけになる。Mangum（`mangum.http` の `logger.exception`）や uvicorn
      （`Exception in ASGI application`）の二重ログが出ない。
    - OTel の FastAPI 計装の `ExceptionHandlerMiddleware` はユーザーのミドルウェアより外側に
      あり、再送出するとスパンの exception イベントと status に**例外メッセージ**（DB 例外なら
      `DETAIL` のキー値）が自動で載る（R7）。握れば届かない。代わりに
      `record_exception_on_current_span()`（型名だけ）を呼ぶ。
    - 応答は `ServerErrorMiddleware` の既定（debug=False）と同じ `500 Internal Server Error`
      （プレーンテキスト）。Lambda の `Errors` メトリクスにも影響しない。
    - **応答の開始後**の例外だけは握れない（500 に差し替えられない）。ERROR を 1 件出したうえで
      `UnhandledErrorAfterResponseStart` を送出し、Mangum が状態を見て 500 にできるようにする。
      この経路だけは Mangum / uvicorn がもう 1 件 ERROR を出す（メッセージは無害）。今は
      ストリーミング応答も BackgroundTasks も無いので実際には起きない。
    - `BaseException`（`CancelledError` など）は捕まえない。**キャンセルされたリクエストの
      アクセスログは残らない**（切断された接続の追跡が必要になったら別途検討する）。

    このミドルウェアは **`create_app()` で最後に登録する**こと。Starlette の
    `add_middleware` は先頭に挿入する（= 最後に登録したものが最も外側になる）ので、
    最後に登録して初めて `RequestSizeLimitMiddleware` が返す 413 まで観測できる。
    崩れると例外を握る位置も内側にずれる。

    `LogContext` を用意する（Lambda では `AsgiLambdaHandler` が先に用意している）。
    """

    def __init__(
        self,
        app: ASGIApp,
        *,
        exclude_paths: tuple[str, ...] = ("/health",),
        tracing_enabled: bool = False,
    ) -> None:
        self.app = app
        self._exclude_paths = exclude_paths
        self._tracing_enabled = tracing_enabled

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        excluded = scope["path"] in self._exclude_paths
        with log_context(http_method=scope.get("method"), scope=scope):
            started = time.perf_counter()
            status = 500
            response_started = False
            failed_after_response_start = False

            async def send_wrapper(message: Message) -> None:
                nonlocal status, response_started
                if message["type"] == "http.response.start":
                    status = message["status"]
                    response_started = True
                await send(message)

            try:
                await self.app(scope, receive, send_wrapper)
            except Exception as exc:
                self._log(scope, status, started, exc=exc)
                self._record_on_span(exc)
                if not response_started:
                    response = PlainTextResponse("Internal Server Error", status_code=500)
                    await response(scope, receive, send)
                    return
                failed_after_response_start = True
            if failed_after_response_start:
                # ★ except 節の**外**で送出する。節内だと元の例外が `__context__` に残り、
                #   Mangum の `logger.exception` などが元のメッセージを描きうる。
                raise UnhandledErrorAfterResponseStart from None
            if not excluded:
                self._log(scope, status, started)

    def _record_on_span(self, exc: BaseException) -> None:
        """スパンへの記録の失敗で 500 の応答を妨げない（except 節の中で呼ばれるため）。"""
        try:
            record_exception_on_current_span(exc, enabled=self._tracing_enabled)
        except Exception:
            warn_once("record-exception", "未処理例外のスパンへの記録に失敗した")

    def _log(
        self, scope: Scope, status: int, started: float, *, exc: BaseException | None = None
    ) -> None:
        elapsed_ms = (time.perf_counter() - started) * 1000
        if exc is not None:
            level = logging.ERROR
        elif status >= 500:
            level = logging.WARNING
        else:
            level = logging.INFO
        logger.log(
            level,
            "%s %s -> %d (%.1fms)%s",
            scope.get("method", "-"),
            scope.get("path", "-"),
            status,
            elapsed_ms,
            ": unhandled exception" if exc is not None else "",
            extra={
                "log_type": "access",
                "http_status_code": status,
                "duration_ms": round(elapsed_ms, 1),
            },
            exc_info=exc,
        )


# ---------------------------------------------------------------------------
# トレース（ADR-013 / SS-178）
# ---------------------------------------------------------------------------
# ★ このセクションは `opentelemetry` をモジュール先頭で import しない（関数内でのみ import）。
#   Lambda の zip には OTel が入らず（ADOT レイヤーが提供）、無効時（既定）や OTel の無い環境でも
#   core が壊れないようにするため。


def _warn_tracing_unavailable(exc: ImportError) -> None:
    logger.warning(
        "TRACING_ENABLED=true だが OpenTelemetry を import できない"
        "ため、トレース無効のまま起動する: %s",
        exc,
    )


_WARNED: set[str] = set()


def warn_once(key: str, message: str, *args: object) -> None:
    """同じ原因の警告を 1 プロセスで 1 回だけ出す（フックはリクエストごとに呼ばれる）。"""
    if key in _WARNED:
        return
    _WARNED.add(key)
    logger.warning(message, *args, exc_info=True)


# 個人情報になりうる標準属性（決定6）。ASGI 計装は `net.peer.ip`（クライアントの IP。Lambda では
# CloudFront のエッジ IP の見込みだが、直接アクセスなら個人の IP）/ `net.peer.port` /
# `http.user_agent`（ヘッダー値）を入れる。API では属性を消せないので空に上書きする。
_PRIVACY_SENSITIVE_ATTRIBUTES = ("net.peer.ip", "net.peer.port", "http.user_agent")


def blank_privacy_sensitive_attributes(span: Any) -> None:
    """`net.peer.*` / `http.user_agent` を空文字に上書きする（FastAPI / Lambda 共用）。"""
    for key in _PRIVACY_SENSITIVE_ATTRIBUTES:
        span.set_attribute(key, "")


def _provider_is_unconfigured(tracer_provider: object | None) -> bool:
    """TracerProvider を誰も構成していない（= no-op のまま）か。"""
    if tracer_provider is not None:
        return False
    from opentelemetry import trace

    return isinstance(trace.get_tracer_provider(), trace.ProxyTracerProvider)


def _url_without_query(scope: Scope) -> str:
    """ASGI scope からクエリ抜きの URL を組み立てる（OTel の ASGI 計装と同じ組み立て）。"""
    from opentelemetry.instrumentation.asgi import get_host_port_url_tuple

    return get_host_port_url_tuple(scope)[2]


def _scrub_query_from_server_span(span: Any, scope: Scope) -> None:
    """ASGI 計装の `server_request_hook`: `http.url` からクエリを除く（決定6）。

    旧 semconv の ASGI 計装は `http.url` にクエリ込みの URL を入れる（`http.target` はパスのみ）。
    トークン類をクエリに載せる経路が将来できても黙って外へ出ないよう、ここで必ず除く。
    あわせて `net.peer.*` / `http.user_agent` を空にする（`blank_privacy_sensitive_attributes`）。
    フックの失敗でリクエストを落とさない。失敗時は安全側（`http.url` を空）に倒す
    （クエリ込みの値を残さない）。警告は 1 回だけ。
    """
    try:
        if span.is_recording():
            blank_privacy_sensitive_attributes(span)
            span.set_attribute("http.url", _url_without_query(scope))
    except Exception:
        warn_once("server-scrub", "http.url からクエリを除けなかったため、空にした")
        with contextlib.suppress(Exception):
            span.set_attribute("http.url", "")


def _scrub_query_from_client_span(span: Any, request_info: Any) -> None:
    """httpx 計装の `request_hook`: 外向きリクエストの `http.url` からクエリ・フラグメントを除く。

    今の Google 呼び出し（Places / Routes。キーは `X-Goog-Api-Key` ヘッダー）の URL にクエリは
    無いが、将来の抜け道（キーをクエリで渡す API の追加等）を塞ぐ。失敗時は安全側（空）に倒す。
    """
    try:
        if span.is_recording():
            url = request_info.url.copy_with(query=None, fragment=None)
            span.set_attribute("http.url", str(url))
    except Exception:
        warn_once(
            "client-scrub", "外向きリクエストの http.url からクエリを除けなかったため、空にした"
        )
        with contextlib.suppress(Exception):
            span.set_attribute("http.url", "")


def _scrub_query_from_urllib_span(span: Any, request: Any) -> None:
    """urllib 計装の `request_hook`: `http.url` のクエリ・フラグメントを除く。失敗時は空に倒す。"""
    try:
        if span.is_recording():
            url = urlsplit(request.full_url)
            span.set_attribute("http.url", urlunsplit((url.scheme, url.netloc, url.path, "", "")))
    except Exception:
        warn_once("urllib-scrub", "urllib の http.url からクエリを除けなかったため、空にした")
        with contextlib.suppress(Exception):
            span.set_attribute("http.url", "")


def resolve_route_template(scope: Scope) -> str | None:
    """ルーティング済みの scope から、prefix を結合したルートのテンプレートを返す。

    例: `/pins/{pin_id}`。ルートに一致していない（404 など）ときは None。生のパスは返さない
    （スパン名・`http.route` のカーディナリティ対策）。

    FastAPI 0.137 以降は `include_router()` したルートがツリー化され、`route.path` が
    prefix を含まなくなる。`iter_route_contexts()` の `context.path`（完全なテンプレート）を
    優先し、見つからなければ `route.path` に倒す。
    """
    route = scope.get("route")
    if route is None:
        return None
    app = scope.get("app")
    if app is not None:
        try:
            from fastapi.routing import iter_route_contexts

            for context in iter_route_contexts(app.routes):
                if getattr(context, "original_route", None) is route:
                    return str(context.path)
        except Exception:
            logger.debug("failed to resolve full route path", exc_info=True)
    path = getattr(route, "path", None)
    return str(path) if path else None


def instrument_fastapi_app(
    app: FastAPI, settings: Settings, *, tracer_provider: object | None = None
) -> None:
    """FastAPI アプリと、リクエスト経路のグローバルな計装（httpx・threading）を有効にする。

    `create_app()` の末尾から呼ぶ（lifespan には置かない。ADR-013 決定7 / SS-183）。
    httpx の計装は lifespan が `httpx.Client` を作るより前に済んでいる必要がある。

    - `settings.tracing_enabled` が False なら何もしない（OTel を import しない）
    - OTel を import できなければ WARNING を出して何もしない
    - TracerProvider が未構成（起動ラッパーを通していない）なら WARNING。計装自体は no-op で動く
    - `/health` は除外、`receive` / `send` の内部スパンは作らない
    - スパン名は FastAPI 計装が `"{METHOD} {route_template}"`、`http.route` も付ける
    """
    if not settings.tracing_enabled:
        return
    # 3 つの計装は個別に守る（1 つ欠けても・失敗しても他は続行し、起動は落とさない。
    # import 時の create_app() から呼ばれるため、ここで例外を出すとプロセスの起動が失敗する）。
    try:
        if _provider_is_unconfigured(tracer_provider):
            logger.warning(
                "TRACING_ENABLED=true だが TracerProvider が構成されていない"
                "（opentelemetry-instrument / ADOT レイヤー経由で起動していない）。"
                "スパンは記録されない"
            )
    except ImportError as exc:
        _warn_tracing_unavailable(exc)
        return

    # グローバルな instrumentor は singleton。create_app() はテストで何度も呼ばれるため冪等にする。
    def _instrument_httpx() -> None:
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor

        instrumentor = HTTPXClientInstrumentor()
        if not instrumentor.is_instrumented_by_opentelemetry:
            instrumentor.instrument(
                tracer_provider=tracer_provider, request_hook=_scrub_query_from_client_span
            )

    def _instrument_urllib() -> None:
        from opentelemetry.instrumentation.urllib import URLLibInstrumentor

        instrumentor = URLLibInstrumentor()
        if not instrumentor.is_instrumented_by_opentelemetry:
            # PyJWKClient の JWKS 取得など。`GOOGLE_JWKS_URL` は設定で変えられ、クエリが付く
            # 可能性がある。自動計装は既定の `redact_url`（一部の署名パラメータだけ）しか
            # 掛けないため、手動でクエリ・フラグメントを除く（決定6）。
            instrumentor.instrument(
                tracer_provider=tracer_provider, request_hook=_scrub_query_from_urllib_span
            )

    def _instrument_threading() -> None:
        from opentelemetry.instrumentation.threading import ThreadingInstrumentor

        instrumentor = ThreadingInstrumentor()
        if not instrumentor.is_instrumented_by_opentelemetry:
            # ThreadPoolExecutor のワーカーへ context を伝え、子スパンがリクエストのトレースに
            # 繋がるようにする（maps/service.py の周回ルート、photo_attacher.py の S3 Copy）。
            instrumentor.instrument()

    def _instrument_fastapi() -> None:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

        if not getattr(app, "_is_instrumented_by_opentelemetry", False):
            FastAPIInstrumentor.instrument_app(
                app,
                tracer_provider=tracer_provider,
                excluded_urls=r"/health$",
                exclude_spans=["receive", "send"],
                server_request_hook=_scrub_query_from_server_span,
            )

    for name, instrument in (
        ("httpx", _instrument_httpx),
        ("urllib", _instrument_urllib),
        ("threading", _instrument_threading),
        ("fastapi", _instrument_fastapi),
    ):
        try:
            instrument()
        except ImportError as exc:
            _warn_tracing_unavailable(exc)
        except Exception:
            logger.warning("%s の計装に失敗したため、その計装なしで起動する", name, exc_info=True)


def instrument_sqlalchemy_engine(
    engine: Engine, settings: Settings, *, tracer_provider: object | None = None
) -> None:
    """engine の DB 呼び出しをスパンにする。`get_engine()` が生成直後に呼ぶ。

    SQLAlchemy の instrumentor は singleton で、`instrument(engine=...)` は最初の 1 回だけ効く。
    本番の engine は 1 つ（`lru_cache`）なので問題ない。テストでは `uninstrument()` で後始末する。
    """
    if not settings.tracing_enabled:
        return
    try:
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
    except ImportError as exc:
        _warn_tracing_unavailable(exc)
        return

    instrumentor = SQLAlchemyInstrumentor()
    if instrumentor.is_instrumented_by_opentelemetry:
        return
    try:
        _instrument_engine(
            instrumentor,
            engine,
            tracer_provider=tracer_provider,
            # `db.statement` はプレースホルダ付きの文のまま（バインド値は記録されない）。
            enable_commenter=False,
            # TODO(SS-178): SQLAlchemy 2.1.0 は計装の `_instruments`（< 2.1.0）の依存チェックで
            # 弾かれるため回避する。upstream の修正後に外す:
            # https://github.com/open-telemetry/opentelemetry-python-contrib/issues/5118
            skip_dep_check=True,
        )
    except Exception:
        # トレースのために DB アクセスを落とさない（get_engine() の中で呼ばれる）。
        # 例: 計装が `sqlalchemy.ext.asyncio` を import するため greenlet が無いと ImportError。
        logger.warning("SQLAlchemy の計装に失敗したため、DB のスパンは記録されない", exc_info=True)


def _safe_error_description(exception: BaseException | None) -> str:
    """スパンの status 説明用。例外の型名と SQLSTATE だけ（メッセージは入れない）。

    psycopg の例外の文字列は `DETAIL: Key (provider_subject)=(...)` のように一意制約違反の
    キー値（Google の sub 等）を含む。SQLSTATE が取れなければ型名のみ。
    """
    if exception is None:
        return "Error"
    name = type(exception).__name__
    sqlstate = _sqlstate_of(exception)
    return f"{name} (SQLSTATE {sqlstate})" if sqlstate else name


def _handle_error_without_message(context: Any) -> None:
    """計装の `handle_error` リスナーの代替（ADR-013 決定6 / D11 A 案）。

    upstream の `_handle_error` は `span.set_status(ERROR, str(original_exception))` として
    例外の文字列をそのまま記録する。それ以外（スパンの取得・終了）は同じ挙動にする。
    """
    # ★ リスナーの中の例外は SQLAlchemy の例外（IntegrityError 等）を置き換えてしまい、
    #   アプリの `except IntegrityError`（savepoint の再試行）が壊れる。必ず握る。
    try:
        span = getattr(context.execution_context, "_otel_span", None)
        if span is None:
            return
        try:
            if span.is_recording():
                from opentelemetry.trace import Status, StatusCode

                span.set_status(
                    Status(StatusCode.ERROR, _safe_error_description(context.original_exception))
                )
        finally:
            span.end()
    except Exception:
        warn_once("handle-error", "SQLAlchemy のエラースパンの記録に失敗した")


def _instrument_engine(instrumentor: Any, engine: Engine, **kwargs: Any) -> None:
    """計装を掛け、`handle_error` リスナーを「メッセージを記録しない版」に差し替える。

    ★ 計装の非公開名（`opentelemetry.instrumentation.sqlalchemy.engine._handle_error`）と、
      `context.execution_context._otel_span` に依存する。版を上げて壊れたら
      `core/tests/test_tracing.py` の D11 のテストが落ちる（フェイルクローズ: 外せなかったときは
      メッセージが漏れないよう、この engine の計装リスナーをすべて外してスパンを諦める）。
    """
    from opentelemetry.instrumentation.sqlalchemy import engine as otel_engine
    from sqlalchemy import event

    tracer = instrumentor.instrument(engine=engine, **kwargs)
    try:
        event.remove(engine, "handle_error", otel_engine._handle_error)
        # `uninstrument()` が外し済みのリスナーを再度 remove して失敗しないよう、
        # 計装側の登録簿からも消す。
        registry = type(tracer)._remove_event_listener_params
        registry[:] = [
            entry
            for entry in registry
            if not (entry[0]() is engine and entry[2] is otel_engine._handle_error)
        ]
    except Exception:
        # フェイルクローズ: 元のリスナー（メッセージを記録する）を残さない。
        try:
            tracer.remove_all_event_listeners()
        except Exception:
            logger.warning("計装のリスナーを外せなかった", exc_info=True)
        raise
    event.listen(engine, "handle_error", _handle_error_without_message)


def record_exception_on_current_span(exc: BaseException, *, enabled: bool) -> None:
    """握った例外（例外ハンドラーで 5xx に変換したもの・`AccessLogMiddleware` が握った
    未処理例外）を、現在のスパンに記録する。

    握られた例外は OTel のミドルウェアまで伝わらず、スパンに残らない。
    記録するのは**例外の型名だけ**（`span.record_exception` は使わない: スタックトレースは
    `__cause__` の連鎖を含み、httpx / botocore の URL や S3 のキーが載りうるため。決定6）。
    `enabled`（`settings.tracing_enabled`）が False のときは、OpenTelemetry を import する前に
    何もせず返る（無効時は import しない契約。503 が起きても import されない）。
    OTel が無い・スパンが記録中でないときも何もしない。
    """
    if not enabled:
        return
    try:
        from opentelemetry import trace
    except ImportError:
        return
    span = trace.get_current_span()
    if not span.is_recording():
        return
    type_name = type(exc).__name__
    span.add_event("exception", {"exception.type": type(exc).__qualname__})
    span.set_status(trace.Status(trace.StatusCode.ERROR, type_name))

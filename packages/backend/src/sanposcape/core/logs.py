"""ログの構造化（ADR-013 決定3 の SS-180 追補）。

- 出力は 1 レコード 1 行の JSON（`JsonLogFormatter`。依存なし）。ローカルは `LOG_FORMAT=console`。
- `trace_id` / `span_id`（トレース有効時）、Lambda の `aws_request_id`、`http_method` /
  `http_route`、認証済みなら `user_id`（内部 UUID。ログイン・refresh・logout を含む）、
  `X-App-Session-Id` が検証を通ったとき `app_session_id` を付ける。
- **例外メッセージは local / test でしか出さない**（ADR-013 決定6: メッセージ経由の漏れを塞ぐ）。

トレースの helper は `core/tracing.py` から import する（依存は `logs → tracing` の一方向。
このモジュールは `access_log` / `observability` を import しない）。
"""

from __future__ import annotations

import contextlib
import json
import logging
import time
import traceback
import uuid
from collections.abc import Iterator
from contextvars import ContextVar
from dataclasses import dataclass, field
from dataclasses import fields as dataclass_fields
from datetime import UTC, datetime
from typing import Any

from starlette.types import Scope

from sanposcape.core.tracing import (
    TraceLookup,
    build_trace_lookup,
    resolve_route_template,
    sqlstate_of,
)

# ★ 分割前と同じロガー名に固定する（`logger` フィールドが出力の一部のため。`tracing.py` 参照）。
logger = logging.getLogger("sanposcape.core.observability")

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
# 属性を黙って出さない。**許可リストに無いキーは黙って捨てられる**ので、キーを足す手順は次のとおり:
#   (a) 値が ADR-013 決定6（個人情報・秘密・クエリ・ボディ）に当たらないことを確かめる。
#   (b) ここに足す（JSON の基本キーや `LogContext` のキーと重ならない名前にする）。
#   (c) `docs/deployment.md` §15 のログの項目表に行を足す。
#   (d) `core/tests/test_logs.py` のキーの検査（許可リストの期待値）に足す。
# ログ呼び出しの `extra=` のキーがここに含まれること、キーが重ならないことは
# `core/tests/test_logs.py` が機械的に検査する。リクエストの文脈（`user_id` など）は
# `extra=` でなく `LogContext` のフィールドとして足す（下の `LogContext` を参照）。
_EXTRA_KEYS = ("log_type", "http_status_code", "duration_ms")


@dataclass(slots=True)
class LogContext:
    """1 リクエスト（Lambda では 1 呼び出し）の間、ログに付ける文脈。

    ★ ContextVar には**この可変オブジェクト**を入れ、値は属性の書き換えで更新する。同期の依存
    （`_authenticate_access_token`）は anyio のスレッドプールで動き、そこでの `ContextVar.set` は
    呼び出し元に戻らない（context がコピーされるため）。コピーされた context も同じオブジェクトを
    指すので、属性の書き換えなら届く。

    **ログに出すキーはこの dataclass のフィールドから導く**（`_LOG_CONTEXT_KEYS`。定義順が出力順）。
    フィールドを足せば JSON / console の両方に出る。ログに出さないフィールドは
    `metadata={"emit": False}` にする。スパンにも写すフィールドは
    `metadata={"span_attribute": "<属性名>"}` で属性名を宣言する
    （`current_span_attributes()`。ログとスパンの対応をここ 1 か所で決める）。
    """

    aws_request_id: str | None = None
    http_method: str | None = None
    http_route: str | None = None
    # 内部 UUID のみ（`bind_user_id`）。スパンには `enduser.id` として写す。認証済みのリクエストでは
    # 認証されたユーザー。ログイン・refresh・logout では確定したユーザー（失敗の 401・
    # `reuse_detected` を含む）で、refresh / logout では**提示されたトークンの持ち主**であり、
    # 送信者本人とは限らない（盗まれたトークンの再利用でも持ち主の ID が付く）。
    user_id: str | None = field(default=None, metadata={"span_attribute": "enduser.id"})
    # アプリの起動ごとのセッション ID（`X-App-Session-Id`。検証済みの UUID v4 だけ）。クライアントの
    # 申告で、端末の証明ではない。スパンには `session.id`（ログインセッションと混同しない名前）。
    app_session_id: str | None = field(default=None, metadata={"span_attribute": "session.id"})
    # `http_route` は routing の後でないと決まらず、format の時点で解決する。ログには出さない。
    scope: Scope | None = field(default=None, metadata={"emit": False})


# ログに出す文脈のキー（`LogContext` の定義順）。固定の tuple を別に持たず、フィールドから導く。
_LOG_CONTEXT_KEYS = tuple(
    f.name for f in dataclass_fields(LogContext) if f.metadata.get("emit", True)
)


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


def bind_user_id(user_id: uuid.UUID) -> None:
    """ユーザー ID（内部 UUID）を、現在のリクエストのログとスパンに付ける**唯一の入口**。

    ここでは `LogContext` に入れるだけで、スパンには触れない。スパンへは、
    `current_span_attributes()` の値を、`AccessLogMiddleware`（FastAPI のサーバースパン。
    応答の開始時と最後の body を送る直前。入口で捕まえたスパンへ）と `aws_lambda/tracing.py`
    （Lambda の親スパン。リクエストの終わり）が写す。
    bind 時点の current span はサーバースパンとは限らず、`Settings`（`tracing_enabled`）も
    知らないため。

    `uuid.UUID` 以外は無視する（メールアドレスなどが誤って渡る経路を型で塞ぐ。例外にもしない）。
    `LogContext` が無ければ何もしない。呼ぶのは認証の成功時（`dependencies.py`）と、ログイン・
    refresh・logout でユーザーが確定した時点（`auth/service.py`）。
    """
    if not isinstance(user_id, uuid.UUID):
        return
    current = _log_context.get()
    if current is not None:
        current.user_id = str(user_id)


def current_span_attributes() -> dict[str, str]:
    """現在の `LogContext` から、スパンに写す `{属性名: 値}` を返す（値が無いものは含めない）。

    `LogContext` が無ければ空。写す先の属性名は `LogContext` のフィールドの metadata で宣言する。
    """
    current = _log_context.get()
    if current is None:
        return {}
    attributes: dict[str, str] = {}
    for item in dataclass_fields(LogContext):
        name = item.metadata.get("span_attribute")
        value = getattr(current, item.name)
        if name and value is not None:
            attributes[name] = str(value)
    return attributes


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


def _qualified_type_name(exc: BaseException) -> str:
    cls = type(exc)
    if cls.__module__ == "builtins":
        return cls.__qualname__
    return f"{cls.__module__}.{cls.__qualname__}"


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
    sqlstate = sqlstate_of(exc)
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
        for key in _LOG_CONTEXT_KEYS:
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
    - 文脈: `aws_request_id` / `http_method` / `http_route` / `user_id` / `app_session_id`
      （`LogContext`）、
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
    _LOG_OPTIONS.trace_lookup = build_trace_lookup() if tracing_enabled else None

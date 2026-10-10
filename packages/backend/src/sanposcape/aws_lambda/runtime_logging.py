"""Lambda のランタイムが root に付けたログハンドラーを、JSON のフォーマッターに差し替える。

**なぜフォーマッターだけ差し替えるか（ADR-013 決定3 の SS-180 追補）**:

- python3.12 のランタイム（awslambdaric）は **root logger にハンドラーを付け**、telemetry の
  fd にフレーム単位で書く（複数行のメッセージも 1 イベント）。ハンドラーを足すと二重に出るし、
  外すとフレーム単位の出力を失う。だから**ハンドラーは足しも外しもせず**、あるものの
  フォーマッターだけを `JsonLogFormatter` にする。
- `LoggingConfig.LogFormat` は **Text のまま**にしている。Lambda の JSON 形式は例外の
  `errorMessage = str(exc)` を必ず出し（ADR-013 決定6 に反する）、`trace_id` も付けず、
  `REPORT` 行も `platform.report` に変わる（ダッシュボードの Q5〜Q7 が未確認の形式になる）ため。
  アプリのフォーマッターなら出す・出さないを制御でき、ローカル・ECS とキーが揃う。
- `Settings` が確定する前（`api.py` の先頭）に呼ぶ。そのためフォーマッターは設定を持たず、
  format のたびに `core.observability` のモジュール単位の設定を読む（後から `create_app()` の
  `configure_logging()` が更新する）。

**`AWS_LAMBDA_FUNCTION_NAME` があるときだけ**行う。pytest では root に caplog のハンドラーが付いて
おり、`test_api.py` が本物の `api.py` を import するため、条件が無いと pytest のハンドラーの
書式を書き換えてしまう。root にハンドラーが無ければ何もしない（`configure_logging()` が
`sanposcape` ロガーに足す経路に任せる）が、Lambda ではランタイムが必ず付けるはずなので
**WARNING を 1 回出す**（ランタイムの実装が変わって JSON 化が静かに効かなくなるのに
気付けるように）。
既に `JsonLogFormatter` のハンドラーは再設定しない（冪等。api と migrate のどちらからも呼べる）。

ランタイムを上げるときは、ログが JSON になっていること（`fields level, trace_id | limit 20`）を
再確認すること（awslambdaric の実装に依存する）。
"""

import logging
import os

from sanposcape.core.observability import JsonLogFormatter

logger = logging.getLogger(__name__)

_warned_no_handler = False


def use_json_format_for_runtime_handlers() -> None:
    global _warned_no_handler
    if not os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        return
    handlers = logging.getLogger().handlers
    if not handlers:
        if not _warned_no_handler:
            _warned_no_handler = True
            logger.warning(
                "Lambda のランタイムが root にログハンドラーを付けていないため、"
                "ログの JSON 化を行わない（ランタイムの実装が変わった可能性がある）"
            )
        return
    formatter = JsonLogFormatter()
    for handler in handlers:
        if not isinstance(handler.formatter, JsonLogFormatter):
            handler.setFormatter(formatter)

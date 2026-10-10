"""API 本体の Lambda ハンドラ（Mangum で FastAPI アプリを ASGI→Lambda アダプトする）。

★ 順序が意味を持つ。

0 段目: `use_json_format_for_runtime_handlers()`（ランタイムのログハンドラーを JSON にする。
ADR-013 決定3 の SS-180 追補）。ハイドレーションや `Settings` の検証の失敗も JSON で出すため、
`Settings` が無くてもできるこの差し替えを最初に行う。

1〜2段目: `sanposcape.main` は import 時に `create_app()` を実行して `Settings` を確定させる
（`main.py` の `app = create_app()`）。Lambda では起動時に Secrets Manager から取得した値を
環境変数へハイドレーションしてから `Settings` を組み立てる必要があるため、
`hydrate_environment_from_secret()` を必ず `sanposcape.main` の import より前に呼ぶ。この順序は
`aws_lambda/tests/test_api.py` で呼び出し順を記録するスタブを使って固定している。
`aws_lambda.tracing`（親スパンの補正、ADR-013）の import も `sanposcape.main` の後ろに置く
（`main` が先に `Settings` を確定させる）。

さらにその後ろ（3段目）で `build_handler()` を呼ぶ。`build_handler()` は FastAPI の
lifespan（`main._lifespan` の startup）を init フェーズで1回だけ起動する（Mangum は
`lifespan="off"`。実行環境ごとに1回で、shutdown は走らせない。ADR-005 SS-183 追補）。
ハイドレーション → `sanposcape.main` の import（`create_app()`）→ `build_handler()` の順で、
lifespan の起動は app の生成より後になる。トレースの親スパン補正は `asgi_wrapper` として渡し、
Mangum に渡す ASGI app だけを包む（lifespan は包む前の FastAPI app から起動する）。
"""

import logging

from pydantic import ValidationError

from sanposcape.aws_lambda.runtime_logging import use_json_format_for_runtime_handlers
from sanposcape.core.runtime_config import hydrate_environment_from_secret

logger = logging.getLogger(__name__)

# 0 段目: ランタイムのログハンドラーのフォーマッターを JSON にする。ハイドレーションや
# `Settings` の検証の失敗（下の `logger.error`）も JSON で出すため、最初に行う。
use_json_format_for_runtime_handlers()

hydrate_environment_from_secret()

_settings_validation_failed = False
try:
    from sanposcape.main import app  # noqa: E402
except ValidationError as exc:
    # Settings の組み立てに失敗した場合、不足フィールド名だけを ERROR ログに出す。
    # include_input=False は必須（input には秘密値が入り得るため）。
    logger.error(
        "Settings validation failed at startup: %s",
        exc.errors(include_input=False, include_url=False),
    )
    _settings_validation_failed = True

if _settings_validation_failed:
    # ★ except 節の外で、元の例外を引き継がずに送出する。ValidationError の文字列には入力値
    #   （秘密値）が含まれうるため、ランタイムが `errorMessage` や `__context__` 経由で
    #   出力しないようにする（ADR-013 決定6 と同じ狙い）。
    raise RuntimeError("Settings validation failed") from None

from sanposcape.aws_lambda.asgi_handler import build_handler  # noqa: E402

# `sanposcape.main`（= Settings の確定）の後に import する（上の docstring）。
from sanposcape.aws_lambda.tracing import wrap_app_for_lambda_tracing  # noqa: E402

handler = build_handler(app, asgi_wrapper=wrap_app_for_lambda_tracing)

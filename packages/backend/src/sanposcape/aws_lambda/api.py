"""API 本体の Lambda ハンドラ（Mangum で FastAPI アプリを ASGI→Lambda アダプトする）。

★ 順序が意味を持つ: `sanposcape.main` は import 時に `create_app()` を実行して
`Settings` を確定させる（`main.py` の `app = create_app()`）。Lambda では起動時に
Secrets Manager から取得した値を環境変数へハイドレーションしてから `Settings` を
組み立てる必要があるため、`hydrate_environment_from_secret()` を必ず
`sanposcape.main` の import より前に呼ぶ。この順序は `aws_lambda/tests/test_api.py` で
呼び出し順を記録するスタブを使って固定している。
"""

import logging

from pydantic import ValidationError

from sanposcape.core.runtime_config import hydrate_environment_from_secret

logger = logging.getLogger(__name__)

hydrate_environment_from_secret()

try:
    from mangum import Mangum  # noqa: E402

    from sanposcape.main import app  # noqa: E402
except ValidationError as exc:
    # Settings の組み立てに失敗した場合、不足フィールド名だけを ERROR ログに出してから
    # 再送出する。include_input=False は必須（input には秘密値が入り得るため）。
    logger.error(
        "Settings validation failed at startup: %s",
        exc.errors(include_input=False, include_url=False),
    )
    raise

handler = Mangum(app, lifespan="auto")

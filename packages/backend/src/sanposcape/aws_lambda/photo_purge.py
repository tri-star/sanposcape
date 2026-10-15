"""アカウント削除後の写真を S3 から消す Lambda ハンドラ（SS-109 / ADR-009 決定35）。

EventBridge Scheduler から1日1回呼ばれ、保持期間を過ぎた削除予約（`account_photo_purges`）に
ついて、利用者の写真の prefix を S3 から消す（`AccountPhotoPurgeService`）。API 本体・migrate と
同じビルド成果物（同じ CodeUri）の別ハンドラ。`create_app()` を通らないので、シークレットの
ハイドレーションとログの設定はここで行う（`migrate.py` と同じ）。

S3 の失敗で打ち切った利用者が1人でもいれば、結果をログに出したうえで例外を送出して
実行を失敗にする（Lambda の Errors のアラームで気付けるようにするため）。予約は残るので、
次回の実行で続きから消す。時間切れで持ち越しただけのときは失敗にしない。

ローカルでは `docker compose exec api uv run python -m sanposcape.aws_lambda.photo_purge`
で1回実行できる（docs/local-development.md）。
"""

import logging
from dataclasses import asdict
from typing import Any

from sanposcape.aws_lambda.runtime_logging import use_json_format_for_runtime_handlers
from sanposcape.config import get_settings
from sanposcape.core.observability import configure_logging
from sanposcape.core.runtime_config import hydrate_environment_from_secret
from sanposcape.database import get_session_factory
from sanposcape.integrations.aws.s3 import build_object_storage
from sanposcape.sanpo_maps.photos.account_purge import build_account_photo_purge_service

logger = logging.getLogger(__name__)

# ランタイムのログハンドラーを JSON にする（api.py・migrate.py と同じ。
# ADR-013 決定3 の SS-180 追補）。
use_json_format_for_runtime_handlers()


class AccountPhotoPurgeIncompleteError(Exception):
    """S3 の失敗で写真を消し切れなかった利用者がいた（予約は残り、次回に続きから消す）。"""


def handler(event: dict[str, Any], context: object) -> dict[str, int]:
    hydrate_environment_from_secret()
    settings = get_settings()
    configure_logging(settings.log_level)

    storage = build_object_storage(settings)
    try:
        with get_session_factory()() as db:
            result = build_account_photo_purge_service(db, storage, settings).purge_due()
    finally:
        close = getattr(storage, "close", None)
        if close is not None:
            close()

    summary = asdict(result)
    logger.info("Account photo purge finished: %s", summary)
    if result.failed:
        raise AccountPhotoPurgeIncompleteError(
            f"{result.failed} of {result.due} due accounts could not be purged; "
            "they are retried on the next run"
        )
    return summary


if __name__ == "__main__":
    print(handler({}, None))

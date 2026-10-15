"""アカウント削除後の写真の削除（SS-109 / ADR-009 決定35）の、モジュールの外への公開面。

`sanpo_maps` の外（`users` のアカウント削除・`aws_lambda/photo_purge.py`）は、このモジュール
だけを import する（ADR-011 M7 の公開面）。実体は `photos/repository.py`・`photos/service.py`。
"""

import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from sanposcape.config import Settings
from sanposcape.integrations.aws.s3 import ObjectStorage
from sanposcape.sanpo_maps.photos.repository import AccountPhotoPurgeRepository
from sanposcape.sanpo_maps.photos.service import AccountPhotoPurgeResult, AccountPhotoPurgeService

__all__ = [
    "AccountPhotoPurgeResult",
    "AccountPhotoPurgeScheduler",
    "AccountPhotoPurgeService",
    "build_account_photo_purge_service",
]


class AccountPhotoPurgeScheduler:
    """アカウント削除のときに写真の削除を予約する、commit しない部品。

    呼び出し元（`AccountDeletionService`）の、利用者を消すトランザクションに乗る。予約と
    利用者の削除は一緒に commit され、どちらかだけが残ることはない。
    """

    def __init__(
        self,
        db: Session,
        *,
        retention_days: int,
        now: Callable[[], datetime] = lambda: datetime.now(UTC),
    ) -> None:
        self._repository = AccountPhotoPurgeRepository(db)
        self._retention = timedelta(days=retention_days)
        self._now = now

    def schedule(self, user_id: uuid.UUID) -> None:
        now = self._now()
        self._repository.add(user_id=user_id, requested_at=now, purge_after=now + self._retention)


def build_account_photo_purge_service(
    db: Session, storage: ObjectStorage, settings: Settings
) -> AccountPhotoPurgeService:
    return AccountPhotoPurgeService(
        db,
        AccountPhotoPurgeRepository(db),
        storage,
        batch_size=settings.account_photo_purge_batch_size,
        deadline_seconds=settings.account_photo_purge_deadline_seconds,
    )

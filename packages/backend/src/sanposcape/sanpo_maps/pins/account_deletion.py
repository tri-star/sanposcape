"""アカウント削除のときの地図のデータの扱い（SS-251 / ADR-009 決定40）の、モジュールの外への公開面。

`sanpo_maps` の外（`users` のアカウント削除）は、このモジュールだけを import する（ADR-011 M7 の
公開面）。書き込みの実体は `pins/repository.py`（pins・pin_tags を持つサブパッケージ。M6）。
"""

import logging
import uuid

from sqlalchemy.orm import Session

from sanposcape.config import Settings
from sanposcape.integrations.aws.s3 import ObjectStorage
from sanposcape.sanpo_maps.photos.cleanup import PhotoObjectCleaner, flatten_photo_keys
from sanposcape.sanpo_maps.pins.repository import PinRepository

__all__ = ["SanpoMapAccountDeletion", "build_sanpo_map_account_deletion"]

logger = logging.getLogger(__name__)


class SanpoMapAccountDeletion:
    """アカウント削除のときに、共有している地図のデータを扱う commit しない部品。

    呼び出し元（`AccountDeletionService`）は、利用者の行を消す前に同じトランザクションで
    `prepare()` を呼び、commit の後に `delete_photo_objects_best_effort()` を呼ぶ。

    - 本人が owner でない地図にある本人のピン・タグは、作成者をその地図の owner に付け替えて
      地図に残す（NULL にしない。応答の `created_by_user_id` を null 許容にしないため）。
      本人の写真は利用者の行の CASCADE で行が消え、S3 は保持期間の後に prefix ごと消える（決定36）。
    - 本人が owner の地図は CASCADE で地図ごと消える。ほかの利用者が上げた写真は本人の prefix の
      外にあるので、キーを集めておき commit の後に best-effort で消す（消し残しは孤立オブジェクト。
      Plane SS-244）。
    """

    def __init__(
        self,
        repository: PinRepository,
        photo_cleaner: PhotoObjectCleaner,
        *,
        request_time_budget_seconds: float,
        call_worst_case_seconds: float,
    ) -> None:
        self._repository = repository
        self._photo_cleaner = photo_cleaner
        self._request_time_budget_seconds = request_time_budget_seconds
        self._call_worst_case_seconds = call_worst_case_seconds

    def prepare(self, user_id: uuid.UUID) -> list[str]:
        """利用者の行を消す前に呼ぶ。付け替えを行い、commit の後に消す S3 キーを返す。

        キーの収集の前に、本人が owner の地図のピン行を `FOR UPDATE` でロックする（地図削除と
        同じ。別の地図へ移動中のピンがあればその commit を待ち、生き残るピンの写真を消さない。
        決定33）。
        """
        pins, tags = self._repository.hand_over_to_map_owners(user_id)
        self._repository.lock_pins_for_owned_maps(user_id)
        keys = flatten_photo_keys(self._repository.list_others_photo_keys_in_owned_maps(user_id))
        logger.info(
            "Account deletion: handed over %d pins and %d tags to map owners; "
            "%d photo objects of other members to delete",
            pins,
            tags,
            len(keys),
        )
        return keys

    def delete_photo_objects_best_effort(self, keys: list[str], *, elapsed_seconds: float) -> None:
        """commit の後に呼ぶ。例外を外に出さない。

        締め切りは、リクエストの時間予算から経過時間（Apple の失効など）と1回の最悪時間を
        引いた値で頭打ちにする（最初のチャンクは必ず試みる。`PhotoObjectCleaner`）。
        """
        remaining = self._request_time_budget_seconds - elapsed_seconds
        self._photo_cleaner.delete_best_effort(
            keys, deadline_seconds=remaining - self._call_worst_case_seconds
        )


def build_sanpo_map_account_deletion(
    db: Session, storage: ObjectStorage, settings: Settings
) -> SanpoMapAccountDeletion:
    call_worst_case = settings.object_storage_delete_call_worst_case_seconds
    return SanpoMapAccountDeletion(
        PinRepository(db),
        PhotoObjectCleaner(
            storage,
            deadline_seconds=settings.pin_photo_delete_deadline_seconds,
            call_worst_case_seconds=call_worst_case,
        ),
        request_time_budget_seconds=settings.request_time_budget_seconds,
        call_worst_case_seconds=call_worst_case,
    )

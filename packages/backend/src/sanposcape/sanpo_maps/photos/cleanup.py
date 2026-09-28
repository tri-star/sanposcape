"""DB commit 後に写真の S3 オブジェクトを best-effort で消す部品（ADR-011）。"""

import logging
import time
from collections.abc import Callable, Iterable

from sanposcape.integrations.aws.s3 import S3_DELETE_OBJECTS_MAX_KEYS, ObjectStorage

logger = logging.getLogger(__name__)


def flatten_photo_keys(pairs: Iterable[tuple[str, str | None]]) -> list[str]:
    """`(s3_key, thumbnail_s3_key)` の列を、`None` を除いて1次元のキー一覧にする。"""
    return [key for pair in pairs for key in pair if key is not None]


class PhotoObjectCleaner:
    """DB commit 後に写真の S3 オブジェクトを best-effort で消す部品（ADR-009 決定22・28,
    ADR-011）。Session を持たず、例外を外に出さない。呼び出し元 Service のトランザクションに
    乗る（ADR-011 M3・M4）。
    """

    def __init__(
        self,
        storage: ObjectStorage,
        *,
        deadline_seconds: float,
        call_worst_case_seconds: float,
        monotonic: Callable[[], float] = time.monotonic,
    ) -> None:
        self._storage = storage
        self._deadline_seconds = deadline_seconds
        self._call_worst_case_seconds = call_worst_case_seconds
        self._monotonic = monotonic

    def delete_best_effort(self, keys: list[str]) -> None:
        """削除対象の S3 キーをまとめて best-effort で消す（ピン・写真・地図の削除,
        ADR-009 決定22・決定28）。

        DB は既に commit 済みのため、ここで打ち切っても整合性は壊れない（残るのは
        「DB から参照されない S3 オブジェクト」だけで、BK-3 の定期掃除で回収できる）。
        `PhotoAttacher.cleanup_staging()` と同じ `monotonic()` 基準の締め切りを使う。
        `S3ObjectStorage.delete_many()` は1回で `S3_DELETE_OBJECTS_MAX_KEYS` 件を処理する
        ため、ここでのチャンクサイズもそれに揃える（R4: このチャンク分割は「時間予算の
        判定の粒度」を決めるためのもので、`S3ObjectStorage.delete_many()` 内部のチャンク
        分割は「S3 `DeleteObjects` の1回あたり最大キー数という API 制約」に対応するための
        もの。目的が違うため2箇所に分かれている）。

        締め切りは「呼ぶ前だけ」ではなく、呼び出し中の S3 の時間も予算に収める
        （ADR-009 決定22 追補, SS-112）。最初のチャンクは残り時間によらず必ず試みる
        （写真1枚や 500枚以下のピンなど、チャンクが1つで終わるケースで設定値によらず
        必ず S3 削除を試みるため）。2つ目以降のチャンクは、始める前に「残り時間 ≥
        1回の最悪時間（`self._call_worst_case_seconds`）」を確認し、
        満たさなければそこで打ち切る。この判定により、S3 の後始末フェーズ全体は
        `max(締め切り, 1回の最悪時間)` 以内に収まる（`delete()`/`delete_many()` は
        削除専用の client で呼ばれ、再試行なし・短い timeout のため1回の呼び出しが
        有界になっている前提, `integrations/aws/s3.py`）。

        `except Exception` で広く捕まえる（R3）: ここは DB commit 後の best-effort 境界
        であり、`ObjectStorageUnavailableError` 以外の想定外の例外（実装のバグ等）が
        飛んできても、削除 API を 500 にしてはならない（決定22「削除 API はストレージが
        理由で失敗を返さない」という意図に反するため）。捕まえた例外は種別ごと
        WARNING ログに残す。
        """
        if not keys:
            return
        deadline_at = self._monotonic() + self._deadline_seconds
        chunk_size = S3_DELETE_OBJECTS_MAX_KEYS
        for index, start in enumerate(range(0, len(keys), chunk_size)):
            if index > 0:
                remaining = deadline_at - self._monotonic()
                if remaining < self._call_worst_case_seconds:
                    logger.warning(
                        "Skipping remaining pin photo object cleanup: not enough time before "
                        "the delete deadline (remaining=%.1fs < per-call worst case=%.1fs; "
                        "%d of %d objects not deleted; they remain as orphaned objects "
                        "until BK-3)",
                        remaining,
                        self._call_worst_case_seconds,
                        len(keys) - start,
                        len(keys),
                    )
                    return
            chunk = keys[start : start + chunk_size]
            try:
                failed = self._storage.delete_many(chunk)
            except Exception as exc:  # noqa: BLE001 - commit後のbest-effort境界のため広く捕まえる
                logger.warning(
                    "Failed to delete %d pin photo objects: %s: %s",
                    len(chunk),
                    type(exc).__name__,
                    exc,
                )
                continue
            if failed:
                logger.warning("Failed to delete %d pin photo objects: %s", len(failed), failed)

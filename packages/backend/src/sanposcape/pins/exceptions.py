class PinNotFoundError(Exception):
    """指定された pin_id が存在しない、または現在のユーザーが member でない地図に属する。

    他人のピンと存在しない ID を区別しない（ADR-003 決定6・walks/exceptions.py と同じ設計）。
    """


class PinPhotoUploadNotReadyError(Exception):
    """アップロード枠が「存在しない・他人のもの・期限切れ・使用済み（別ピンに紐付け済み）・
    S3 に実体が無い・JPEG としてデコードできない・サイズ超過・画素数超過」のいずれか。

    区別せず 409 にする（backend-plan.md 5.3 (4)）。
    """


class StorageQuotaExceededError(Exception):
    """アップロード者の合計容量上限（`PIN_PHOTO_USER_QUOTA_BYTES`）を超える。"""


class PinPhotoTooLargeError(Exception):
    """1枚あたりの上限（`PIN_PHOTO_MAX_BYTES`）を超える。"""


class TooManyPendingUploadsError(Exception):
    """未使用（`pending`）の枠の同時保有数が上限（`PIN_PHOTO_MAX_PENDING_UPLOADS`）を超える。"""

"""ピン写真の S3 キー組み立て（純粋関数、DB/HTTP に依存しない）。

キーは常にサーバーが `user_id`・`upload_id` から組み立てる。クライアントからキーを
受け取らない（presigned POST は `key` 完全一致の条件で縛るため、他人の prefix に
書き込めない。backend-plan.md 5.4・5.9 の IDOR 対策）。
"""

import uuid

#: サムネイルのキーに埋め込むサイズ（長辺 px）。将来サイズを追加しても既存キーは不変になる
#: （B-D19）。`Settings.pin_photo_thumbnail_max_edge_px` と一致することをテストで固定する。
THUMBNAIL_SIZES: tuple[int, ...] = (512,)


def staging_key(*, user_id: uuid.UUID, upload_id: uuid.UUID) -> str:
    """アップロード直後（未確定）のキー。S3 のライフサイクルで1日 expire する。"""
    return f"staging/pins/{user_id}/{upload_id}.jpg"


def original_key(*, user_id: uuid.UUID, upload_id: uuid.UUID) -> str:
    """確定済みの原本のキー（永続）。"""
    return f"original/pins/{user_id}/{upload_id}.jpg"


def thumbnail_key(*, user_id: uuid.UUID, upload_id: uuid.UUID, size: int) -> str:
    """サムネイルのキー（永続）。"""
    return f"thumb/pins/{user_id}/{upload_id}/{size}.jpg"

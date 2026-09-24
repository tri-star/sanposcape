"""keyset（cursor）ページネーション用の共通ユーティリティ。

`cursor` はクライアントにとって不透明なトークンとして扱う（中身の形式は
API 契約に含めない。クライアントは `next_cursor` をそのまま次のリクエストへ渡すだけでよい）。
"""

import base64
import binascii
import re
import uuid
from datetime import datetime


class InvalidCursorError(Exception):
    """cursor の復号・パースに失敗した（クライアントからの不正な入力）。"""


def encode_cursor(started_at: datetime, item_id: uuid.UUID) -> str:
    raw = f"{started_at.isoformat()}|{item_id}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        started_at_raw, item_id_raw = raw.split("|", 1)
        started_at = datetime.fromisoformat(started_at_raw)
        if started_at.tzinfo is None or started_at.utcoffset() is None:
            raise ValueError("Cursor timestamp must be timezone-aware")
        item_id = uuid.UUID(item_id_raw)
    except (
        ValueError,
        binascii.Error,
        UnicodeDecodeError,
    ) as exc:
        raise InvalidCursorError("Invalid cursor") from exc
    return started_at, item_id


def encode_position_cursor(position: int, item_id: uuid.UUID) -> str:
    """`(position, id)` の keyset ページング用の cursor（`pin_photos` の全件取得で使う）。

    `encode_cursor`/`decode_cursor`（`(datetime, uuid)` 用）とは対になる `int` 版。
    形式は同じく `urlsafe_b64("<position>|<uuid>")`。
    """
    raw = f"{position}|{item_id}"
    return base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")


def decode_position_cursor(cursor: str) -> tuple[int, uuid.UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode("ascii")).decode("utf-8")
        position_raw, item_id_raw = raw.split("|", 1)
        if not re.fullmatch(r"-?\d+", position_raw):
            raise ValueError("Cursor position must be an integer")
        position = int(position_raw)
        if position < 0:
            raise ValueError("Cursor position must not be negative")
        item_id = uuid.UUID(item_id_raw)
    except (
        ValueError,
        binascii.Error,
        UnicodeDecodeError,
    ) as exc:
        raise InvalidCursorError("Invalid cursor") from exc
    return position, item_id

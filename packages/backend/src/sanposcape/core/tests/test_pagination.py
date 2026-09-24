import base64
import uuid
from datetime import UTC, datetime

import pytest

from sanposcape.core.pagination import (
    InvalidCursorError,
    decode_cursor,
    decode_position_cursor,
    encode_cursor,
    encode_position_cursor,
)


def test_encode_decode_cursor_round_trips() -> None:
    started_at = datetime(2026, 8, 1, 9, 0, 0, tzinfo=UTC)
    item_id = uuid.uuid4()

    cursor = encode_cursor(started_at, item_id)
    decoded_started_at, decoded_item_id = decode_cursor(cursor)

    assert decoded_started_at == started_at
    assert decoded_item_id == item_id


def test_decode_cursor_with_naive_timestamp_raises_invalid_cursor_error() -> None:
    started_at = datetime(2026, 8, 1, 9, 0, 0)
    cursor = encode_cursor(started_at, uuid.uuid4())

    with pytest.raises(InvalidCursorError):
        decode_cursor(cursor)


def test_decode_empty_cursor_raises_invalid_cursor_error() -> None:
    with pytest.raises(InvalidCursorError):
        decode_cursor("")


def test_decode_non_base64_cursor_raises_invalid_cursor_error() -> None:
    with pytest.raises(InvalidCursorError):
        decode_cursor("not-a-valid-cursor!!")


def test_decode_tampered_cursor_raises_invalid_cursor_error() -> None:
    started_at = datetime(2026, 8, 1, 9, 0, 0, tzinfo=UTC)
    cursor = encode_cursor(started_at, uuid.uuid4())

    tampered = cursor[:-4] + ("A" if cursor[-4] != "A" else "B") + cursor[-3:]

    with pytest.raises(InvalidCursorError):
        decode_cursor(tampered)


def test_decode_cursor_missing_separator_raises_invalid_cursor_error() -> None:
    malformed = base64.urlsafe_b64encode(b"no-separator-here").decode("ascii")

    with pytest.raises(InvalidCursorError):
        decode_cursor(malformed)


def test_decode_cursor_with_invalid_uuid_raises_invalid_cursor_error() -> None:
    raw = "2026-08-01T09:00:00+00:00|not-a-uuid"
    malformed = base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")

    with pytest.raises(InvalidCursorError):
        decode_cursor(malformed)


def test_encode_decode_position_cursor_round_trips() -> None:
    item_id = uuid.uuid4()

    cursor = encode_position_cursor(3, item_id)
    decoded_position, decoded_item_id = decode_position_cursor(cursor)

    assert decoded_position == 3
    assert decoded_item_id == item_id


def test_decode_position_cursor_with_zero_round_trips() -> None:
    item_id = uuid.uuid4()

    cursor = encode_position_cursor(0, item_id)

    assert decode_position_cursor(cursor) == (0, item_id)


def test_decode_position_cursor_with_negative_position_raises_invalid_cursor_error() -> None:
    item_id = uuid.uuid4()
    cursor = encode_position_cursor(-1, item_id)

    with pytest.raises(InvalidCursorError):
        decode_position_cursor(cursor)


def test_decode_position_cursor_with_non_numeric_position_raises_invalid_cursor_error() -> None:
    raw = f"not-a-number|{uuid.uuid4()}"
    malformed = base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")

    with pytest.raises(InvalidCursorError):
        decode_position_cursor(malformed)


def test_decode_position_cursor_with_invalid_uuid_raises_invalid_cursor_error() -> None:
    raw = "3|not-a-uuid"
    malformed = base64.urlsafe_b64encode(raw.encode("utf-8")).decode("ascii")

    with pytest.raises(InvalidCursorError):
        decode_position_cursor(malformed)


def test_decode_position_cursor_with_empty_string_raises_invalid_cursor_error() -> None:
    with pytest.raises(InvalidCursorError):
        decode_position_cursor("")


def test_decode_position_cursor_with_non_base64_raises_invalid_cursor_error() -> None:
    with pytest.raises(InvalidCursorError):
        decode_position_cursor("not-a-valid-cursor!!")


def test_decode_position_cursor_missing_separator_raises_invalid_cursor_error() -> None:
    malformed = base64.urlsafe_b64encode(b"no-separator-here").decode("ascii")

    with pytest.raises(InvalidCursorError):
        decode_position_cursor(malformed)


def test_decode_position_cursor_with_tampered_uuid_raises_invalid_cursor_error() -> None:
    cursor = encode_position_cursor(1, uuid.uuid4())
    tampered = cursor[:-4] + ("A" if cursor[-4] != "A" else "B") + cursor[-3:]

    with pytest.raises(InvalidCursorError):
        decode_position_cursor(tampered)

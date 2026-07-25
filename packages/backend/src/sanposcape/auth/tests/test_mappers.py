import uuid

from sanposcape.auth.mappers import to_session_read
from sanposcape.auth.service import SessionResult
from sanposcape.users.models import User


def test_to_session_read_maps_all_fields() -> None:
    """B-3: `to_session_read()` は `router.py` / `dev_router.py` の両方から使う public 関数。
    以前は `router.py` の `_to_session_read`（アンダースコア始まり = モジュール内専用の意思表示）を
    `dev_router.py` が直接 import しており、`router.py` 側の担当者が「private だから自由に変えて
    いい」と判断すると `dev_router.py` が静かに壊れるリスクがあった。
    """
    user = User(
        id=uuid.uuid4(),
        provider="google",
        provider_subject="sub-1",
        email="user@example.com",
        display_name="山田太郎",
        photo_url="https://example.com/p.png",
    )
    result = SessionResult(
        access_token="access-token-value",
        expires_in=900,
        refresh_token="refresh-token-value",
        user=user,
    )

    session_read = to_session_read(result)

    assert session_read.access_token == "access-token-value"
    assert session_read.expires_in == 900
    assert session_read.refresh_token == "refresh-token-value"
    assert session_read.user.id == user.id
    assert session_read.user.email == "user@example.com"
    assert session_read.user.display_name == "山田太郎"
    assert session_read.user.photo_url == "https://example.com/p.png"

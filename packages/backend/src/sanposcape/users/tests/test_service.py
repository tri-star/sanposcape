from sqlalchemy.orm import Session

from sanposcape.users.repository import UserRepository
from sanposcape.users.service import UserService


def _make_service(db_session: Session) -> UserService:
    return UserService(db_session, UserRepository(db_session))


def test_find_or_create_creates_new_user(db_session: Session) -> None:
    service = _make_service(db_session)

    user = service.find_or_create(
        provider="google",
        subject="google-sub-1",
        email="user@example.com",
        display_name="山田太郎",
        photo_url="https://example.com/photo.png",
    )

    assert user.id is not None
    assert user.provider == "google"
    assert user.provider_subject == "google-sub-1"
    assert user.email == "user@example.com"
    assert user.display_name == "山田太郎"
    assert user.photo_url == "https://example.com/photo.png"


def test_find_or_create_returns_same_user_on_revisit(db_session: Session) -> None:
    service = _make_service(db_session)

    first = service.find_or_create(
        provider="google",
        subject="google-sub-1",
        email="user@example.com",
        display_name="山田太郎",
        photo_url=None,
    )
    second = service.find_or_create(
        provider="google",
        subject="google-sub-1",
        email="user@example.com",
        display_name="山田太郎",
        photo_url=None,
    )

    assert first.id == second.id


def test_find_or_create_updates_profile_with_latest_values(db_session: Session) -> None:
    service = _make_service(db_session)

    first = service.find_or_create(
        provider="google",
        subject="google-sub-1",
        email="old@example.com",
        display_name="旧名前",
        photo_url="https://example.com/old.png",
    )
    updated = service.find_or_create(
        provider="google",
        subject="google-sub-1",
        email="new@example.com",
        display_name="新名前",
        photo_url="https://example.com/new.png",
    )

    assert updated.id == first.id
    assert updated.email == "new@example.com"
    assert updated.display_name == "新名前"
    assert updated.photo_url == "https://example.com/new.png"


def test_find_or_create_does_not_overwrite_with_none(db_session: Session) -> None:
    service = _make_service(db_session)

    first = service.find_or_create(
        provider="google",
        subject="google-sub-1",
        email="user@example.com",
        display_name="山田太郎",
        photo_url="https://example.com/photo.png",
    )
    updated = service.find_or_create(
        provider="google",
        subject="google-sub-1",
        email=None,
        display_name=None,
        photo_url=None,
    )

    assert updated.id == first.id
    assert updated.email == "user@example.com"
    assert updated.display_name == "山田太郎"
    assert updated.photo_url == "https://example.com/photo.png"


def test_find_or_create_different_provider_same_subject_is_different_user(
    db_session: Session,
) -> None:
    service = _make_service(db_session)

    google_user = service.find_or_create(
        provider="google",
        subject="shared-subject",
        email="user@example.com",
        display_name="山田太郎",
        photo_url=None,
    )
    dev_user = service.find_or_create(
        provider="dev",
        subject="shared-subject",
        email="shared-subject@dev.local",
        display_name="shared-subject",
        photo_url=None,
    )

    assert google_user.id != dev_user.id

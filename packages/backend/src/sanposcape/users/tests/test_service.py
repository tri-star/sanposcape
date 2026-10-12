import logging
import uuid
from unittest import mock

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from sanposcape.auth.tests.conftest import FakeAppleSignInClient
from sanposcape.integrations.apple.exceptions import (
    AppleSignInNotConfiguredError,
    AppleSignInRejectedError,
    AppleSignInUnavailableError,
)
from sanposcape.users.exceptions import AccountDeletionUnavailableError
from sanposcape.users.models import AppleAuthorization
from sanposcape.users.repository import AppleAuthorizationRepository, UserRepository
from sanposcape.users.service import AccountDeletionService, UserService


def _make_service(db_session: Session) -> UserService:
    return UserService(db_session, UserRepository(db_session))


def test_get_by_id_returns_existing_user(db_session: Session) -> None:
    service = _make_service(db_session)
    created = service.find_or_create(
        provider="google",
        subject="google-sub-1",
        email="user@example.com",
        display_name="山田太郎",
        photo_url=None,
    )

    found = service.get_by_id(created.id)

    assert found is not None
    assert found.id == created.id


def test_get_by_id_returns_none_for_unknown_id(db_session: Session) -> None:
    service = _make_service(db_session)

    assert service.get_by_id(uuid.uuid4()) is None


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


def test_delete_current_user_deletes_user_and_commits(db_session: Session) -> None:
    service = _make_service(db_session)
    user = service.find_or_create(
        provider="google",
        subject="delete-me",
        email=None,
        display_name=None,
        photo_url=None,
    )

    with mock.patch.object(db_session, "commit", wraps=db_session.commit) as commit_spy:
        service.delete_current_user(user)

    commit_spy.assert_called_once()
    assert service.get_by_id(user.id) is None


def test_delete_current_user_does_not_commit_when_delete_fails(db_session: Session) -> None:
    service = _make_service(db_session)
    user = service.find_or_create(
        provider="google",
        subject="delete-fails",
        email=None,
        display_name=None,
        photo_url=None,
    )

    with (
        mock.patch.object(
            service._repository, "delete", side_effect=RuntimeError("database error")
        ),
        mock.patch.object(db_session, "commit", wraps=db_session.commit) as commit_spy,
        pytest.raises(RuntimeError, match="database error"),
    ):
        service.delete_current_user(user)

    commit_spy.assert_not_called()


def _find_or_create(service: UserService, **overrides):
    params = {
        "provider": "apple",
        "subject": "apple-sub-1",
        "email": None,
        "display_name": None,
        "photo_url": None,
    }
    params.update(overrides)
    return service.find_or_create(**params)


def test_initial_display_name_is_used_for_new_user(db_session: Session) -> None:
    service = _make_service(db_session)

    user = _find_or_create(service, initial_display_name="山田太郎")

    assert user.display_name == "山田太郎"


def test_idp_display_name_takes_precedence_over_initial_display_name(
    db_session: Session,
) -> None:
    service = _make_service(db_session)

    user = _find_or_create(service, display_name="IdP の名前", initial_display_name="端末の名前")

    assert user.display_name == "IdP の名前"


def test_initial_display_name_is_not_applied_to_existing_user(db_session: Session) -> None:
    service = _make_service(db_session)
    _find_or_create(service, initial_display_name="最初の名前")

    again = _find_or_create(service, initial_display_name="別の名前")

    assert again.display_name == "最初の名前"


def test_initial_display_name_fills_null_display_name_of_existing_user(
    db_session: Session,
) -> None:
    service = _make_service(db_session)
    _find_or_create(service)  # display_name = NULL で作成

    again = _find_or_create(service, initial_display_name="後から来た名前")

    assert again.display_name == "後から来た名前"


def test_idp_display_name_still_overwrites_and_initial_is_ignored_for_existing_user(
    db_session: Session,
) -> None:
    service = _make_service(db_session)
    _find_or_create(service)

    again = _find_or_create(service, display_name="IdP の名前", initial_display_name="端末の名前")

    assert again.display_name == "IdP の名前"


class TestAccountDeletionService:
    def _build(
        self, db_session: Session, client: FakeAppleSignInClient
    ) -> tuple[AccountDeletionService, UserService, AppleAuthorizationRepository]:
        user_service = _make_service(db_session)
        authorizations = AppleAuthorizationRepository(db_session)
        service = AccountDeletionService(db_session, user_service, authorizations, client)
        return service, user_service, authorizations

    def _apple_user(self, db_session: Session, user_service: UserService, *, token: bool = True):
        user = user_service.find_or_create(
            provider="apple",
            subject="apple-sub-1",
            email=None,
            display_name=None,
            photo_url=None,
        )
        if token:
            user_service.save_apple_authorization(
                user.id, client_id="com.sanposcape.app.dev", refresh_token="stored-refresh-token"
            )
        db_session.commit()
        return user

    def test_revokes_stored_token_before_deleting_and_outside_a_transaction(
        self, db_session: Session
    ) -> None:
        events: list[str] = []
        in_transaction: list[bool] = []

        def on_revoke() -> None:
            events.append("revoke")
            in_transaction.append(db_session.in_transaction())

        client = FakeAppleSignInClient(on_revoke=on_revoke)
        service, user_service, _ = self._build(db_session, client)
        user = self._apple_user(db_session, user_service)
        user_id = user.id
        original_delete = user_service.delete_current_user

        def spy_delete(u):
            events.append("delete")
            original_delete(u)

        user_service.delete_current_user = spy_delete  # type: ignore[method-assign]

        service.delete_account(user)

        assert client.revoke_calls == [("stored-refresh-token", "com.sanposcape.app.dev")]
        assert events == ["revoke", "delete"]
        assert in_transaction == [False]
        assert user_service.get_by_id(user_id) is None
        assert db_session.scalars(select(AppleAuthorization)).all() == []

    def test_temporary_failure_does_not_delete(self, db_session: Session) -> None:
        client = FakeAppleSignInClient(revoke_error=AppleSignInUnavailableError("down"))
        service, user_service, authorizations = self._build(db_session, client)
        user = self._apple_user(db_session, user_service)
        user_id = user.id

        with (
            mock.patch.object(user_service, "delete_current_user") as delete_spy,
            pytest.raises(AccountDeletionUnavailableError),
        ):
            service.delete_account(user)

        delete_spy.assert_not_called()
        assert user_service.get_by_id(user_id) is not None
        assert authorizations.get(user_id) is not None

    @pytest.mark.parametrize(
        ("error", "expected_level"),
        [
            (AppleSignInRejectedError("invalid_grant", 400), logging.WARNING),
            (AppleSignInRejectedError("unknown", 400), logging.WARNING),
            (AppleSignInRejectedError("invalid_client", 401), logging.ERROR),
            (AppleSignInRejectedError("unauthorized_client", 400), logging.ERROR),
            (AppleSignInNotConfiguredError("x"), logging.ERROR),
        ],
        ids=["invalid_grant", "unknown", "invalid_client", "unauthorized_client", "not-configured"],
    )
    def test_permanent_failures_still_delete_and_log(
        self, db_session: Session, caplog, error: Exception, expected_level: int
    ) -> None:
        client = FakeAppleSignInClient(revoke_error=error)
        service, user_service, _ = self._build(db_session, client)
        user = self._apple_user(db_session, user_service)
        user_id = user.id

        with caplog.at_level(logging.DEBUG, logger="sanposcape.users.service"):
            service.delete_account(user)

        assert user_service.get_by_id(user_id) is None
        assert [r.levelno for r in caplog.records] == [expected_level]
        assert "stored-refresh-token" not in caplog.text

    def test_apple_user_without_token_is_deleted_without_revoking(
        self, db_session: Session, caplog
    ) -> None:
        client = FakeAppleSignInClient()
        service, user_service, _ = self._build(db_session, client)
        user = self._apple_user(db_session, user_service, token=False)
        user_id = user.id

        with caplog.at_level(logging.DEBUG, logger="sanposcape.users.service"):
            service.delete_account(user)

        assert client.revoke_calls == []
        assert user_service.get_by_id(user_id) is None
        assert [r.levelno for r in caplog.records] == [logging.INFO]

    @pytest.mark.parametrize("provider", ["google", "dev"])
    def test_non_apple_user_never_reads_apple_authorizations(
        self, db_session: Session, provider: str
    ) -> None:
        """Google / dev ユーザーはテーブルを読まない（migrate 前の空白で削除を壊さない）。"""
        client = FakeAppleSignInClient()
        service, user_service, authorizations = self._build(db_session, client)
        user = user_service.find_or_create(
            provider=provider,
            subject="sub-1",
            email=None,
            display_name=None,
            photo_url=None,
        )
        user_id = user.id

        with mock.patch.object(authorizations, "get") as get_spy:
            service.delete_account(user)

        get_spy.assert_not_called()
        assert client.revoke_calls == []
        assert user_service.get_by_id(user_id) is None

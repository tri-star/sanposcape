import contextlib
import logging
import uuid
from datetime import UTC, datetime, timedelta
from unittest import mock
from urllib.parse import parse_qs

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from sanposcape.auth.tests.conftest import FakeAppleSignInClient
from sanposcape.config import Settings
from sanposcape.conftest import TestSessionLocal
from sanposcape.integrations.apple.client import AppleSignInClient, HttpAppleSignInClient
from sanposcape.integrations.apple.exceptions import (
    AppleSignInClientSecretError,
    AppleSignInNotConfiguredError,
    AppleSignInRejectedError,
    AppleSignInUnavailableError,
)
from sanposcape.sanpo_maps.models import AccountPhotoPurge
from sanposcape.sanpo_maps.photos.account_purge import AccountPhotoPurgeScheduler
from sanposcape.users.exceptions import AccountDeletionUnavailableError
from sanposcape.users.models import AppleAuthorization, User
from sanposcape.users.repository import AppleAuthorizationRepository, UserRepository
from sanposcape.users.service import AccountDeletionService, UserService


def _make_service(db_session: Session) -> UserService:
    return UserService(db_session, UserRepository(db_session))


_FIXED_NOW = datetime(2026, 10, 15, 12, 0, tzinfo=UTC)


def _make_photo_purges(db_session: Session) -> AccountPhotoPurgeScheduler:
    return AccountPhotoPurgeScheduler(db_session, retention_days=30, now=lambda: _FIXED_NOW)


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


SERVICE_LOGGER = "sanposcape.users.service"


def _service_records(caplog) -> list[logging.LogRecord]:
    return [r for r in caplog.records if r.name == SERVICE_LOGGER]


class _CountingAppleAuthorizationRepository(AppleAuthorizationRepository):
    """`get` の呼び出し回数を数える（Google / dev ユーザーが読まないことの検証用）。"""

    get_calls = 0

    def get(self, user_id: uuid.UUID) -> AppleAuthorization | None:
        self.get_calls += 1
        return super().get(user_id)


class TestAccountDeletionService:
    def _build(
        self, db_session: Session, client: AppleSignInClient
    ) -> tuple[AccountDeletionService, UserService, AppleAuthorizationRepository]:
        user_service = _make_service(db_session)
        authorizations = AppleAuthorizationRepository(db_session)
        service = AccountDeletionService(
            db_session, user_service, authorizations, client, _make_photo_purges(db_session)
        )
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
        """失効の瞬間はユーザーも token も残っていて、DB のトランザクションは閉じている。"""
        during_revoke: dict[str, bool] = {}
        user_id_holder: list[uuid.UUID] = []

        def on_revoke() -> None:
            # 別セッションから見て、失効の時点ではまだ何も消えていないことを確かめる。
            with TestSessionLocal() as other:
                during_revoke["user_exists"] = other.get(User, user_id_holder[0]) is not None
                during_revoke["token_exists"] = (
                    other.get(AppleAuthorization, user_id_holder[0]) is not None
                )
            during_revoke["in_transaction"] = db_session.in_transaction()

        client = FakeAppleSignInClient(on_revoke=on_revoke)
        service, user_service, _ = self._build(db_session, client)
        user = self._apple_user(db_session, user_service)
        user_id_holder.append(user.id)
        user_id = user.id

        service.delete_account(user)

        assert client.revoke_calls == [("stored-refresh-token", "com.sanposcape.app.dev")]
        assert during_revoke == {
            "user_exists": True,
            "token_exists": True,
            "in_transaction": False,
        }
        with TestSessionLocal() as other:
            assert other.get(User, user_id) is None
            assert other.scalars(select(AppleAuthorization)).all() == []

    def test_temporary_failure_does_not_delete(self, db_session: Session) -> None:
        client = FakeAppleSignInClient(
            revoke_error=AppleSignInUnavailableError("down", reason="http_5xx")
        )
        service, user_service, authorizations = self._build(db_session, client)
        user = self._apple_user(db_session, user_service)
        user_id = user.id

        with pytest.raises(AccountDeletionUnavailableError):
            service.delete_account(user)

        with TestSessionLocal() as other:
            assert other.get(User, user_id) is not None
            assert other.get(AppleAuthorization, user_id) is not None

    def test_temporary_failure_logs_only_the_fixed_reason(
        self, db_session: Session, caplog
    ) -> None:
        error = AppleSignInUnavailableError("arbitrary detail", reason="timeout")
        service, user_service, _ = self._build(
            db_session, FakeAppleSignInClient(revoke_error=error)
        )
        user = self._apple_user(db_session, user_service)

        with (
            caplog.at_level(logging.DEBUG, logger=SERVICE_LOGGER),
            pytest.raises(AccountDeletionUnavailableError),
        ):
            service.delete_account(user)

        assert [r.levelno for r in _service_records(caplog)] == [logging.WARNING]
        assert "timeout" in caplog.text
        assert "arbitrary detail" not in caplog.text

    def test_user_deleted_by_another_request_during_revocation_is_a_noop_success(
        self, db_session: Session
    ) -> None:
        """失効の間に別のリクエストが同じユーザーを削除しても、500 にならず冪等に終わる。"""
        user_id_holder: list[uuid.UUID] = []

        def delete_from_another_session() -> None:
            with TestSessionLocal() as other:
                other.delete(other.get(User, user_id_holder[0]))
                other.commit()

        client = FakeAppleSignInClient(on_revoke=delete_from_another_session)
        service, user_service, _ = self._build(db_session, client)
        user = self._apple_user(db_session, user_service)
        user_id_holder.append(user.id)
        user_id = user.id

        service.delete_account(user)  # 例外にならない

        assert len(client.revoke_calls) == 1
        with TestSessionLocal() as other:
            assert other.get(User, user_id) is None
            assert other.scalars(select(AppleAuthorization)).all() == []

    @pytest.mark.parametrize(
        ("error", "expected_level"),
        [
            (AppleSignInRejectedError("invalid_grant", 400), logging.WARNING),
            (AppleSignInRejectedError("unknown", 400), logging.ERROR),
            (AppleSignInRejectedError("invalid_request", 400), logging.ERROR),
            (AppleSignInRejectedError("invalid_client", 401), logging.ERROR),
            (AppleSignInRejectedError("unauthorized_client", 400), logging.ERROR),
            (AppleSignInClientSecretError("secret generation failed: TypeError"), logging.ERROR),
            (AppleSignInNotConfiguredError("x"), logging.ERROR),
        ],
        ids=[
            "invalid_grant",
            "unknown",
            "invalid_request",
            "invalid_client",
            "unauthorized_client",
            "client-secret-error",
            "not-configured",
        ],
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
        assert [r.levelno for r in _service_records(caplog)] == [expected_level]
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
        assert [r.levelno for r in _service_records(caplog)] == [logging.INFO]

    @pytest.mark.parametrize("provider", ["google", "dev"])
    def test_non_apple_user_never_reads_apple_authorizations(
        self, db_session: Session, provider: str
    ) -> None:
        """Google / dev ユーザーはテーブルを読まない（migrate 前の空白で削除を壊さない）。"""
        client = FakeAppleSignInClient()
        user_service = _make_service(db_session)
        authorizations = _CountingAppleAuthorizationRepository(db_session)
        service = AccountDeletionService(
            db_session, user_service, authorizations, client, _make_photo_purges(db_session)
        )
        user = user_service.find_or_create(
            provider=provider,
            subject="sub-1",
            email=None,
            display_name=None,
            photo_url=None,
        )
        user_id = user.id

        service.delete_account(user)

        assert authorizations.get_calls == 0
        assert client.revoke_calls == []
        assert user_service.get_by_id(user_id) is None

    def test_refresh_token_and_client_secret_never_logged(
        self, db_session: Session, ec_private_key, caplog
    ) -> None:
        """実際の HTTP クライアント（モック通信）で、Apple に送った値がログに出ないこと。"""
        client_secrets: list[str] = []
        responses = [
            httpx.Response(500, content=b"stored-refresh-token"),
            httpx.Response(400, json={"error": "invalid_grant", "echo": "stored-refresh-token"}),
            httpx.Response(401, json={"error": "invalid_client"}),
        ]
        settings = Settings(apple_team_id="TEAM123456", apple_sign_in_key_id="KEY1234567")

        with caplog.at_level(logging.DEBUG):
            for index, response in enumerate(responses):

                def handler(request: httpx.Request, response=response) -> httpx.Response:
                    client_secrets.append(parse_qs(request.content.decode())["client_secret"][0])
                    return response

                http_client = HttpAppleSignInClient(
                    settings,
                    private_key=ec_private_key,
                    client=httpx.Client(transport=httpx.MockTransport(handler)),
                )
                service, user_service, _ = self._build(db_session, http_client)
                user = user_service.find_or_create(
                    provider="apple",
                    subject=f"apple-sub-{index}",
                    email=None,
                    display_name=None,
                    photo_url=None,
                )
                user_service.save_apple_authorization(
                    user.id,
                    client_id="com.sanposcape.app.dev",
                    refresh_token="stored-refresh-token",
                )
                db_session.commit()
                # 500 は一時障害（削除しない）。ここではログの中身だけを見る。
                with contextlib.suppress(AccountDeletionUnavailableError):
                    service.delete_account(user)

        assert len(client_secrets) == len(responses)
        for secret in ["stored-refresh-token", *client_secrets]:
            assert secret not in caplog.text


class TestAccountDeletionSchedulesPhotoPurge:
    """アカウント削除は写真の削除を予約し、利用者の削除と同じ commit に乗せる（SS-109）。"""

    def _service(self, db_session: Session) -> tuple[AccountDeletionService, UserService]:
        user_service = _make_service(db_session)
        service = AccountDeletionService(
            db_session,
            user_service,
            AppleAuthorizationRepository(db_session),
            FakeAppleSignInClient(),
            _make_photo_purges(db_session),
        )
        return service, user_service

    def _google_user(self, db_session: Session, user_service: UserService) -> User:
        user = user_service.find_or_create(
            provider="google", subject="sub-purge", email=None, display_name=None, photo_url=None
        )
        db_session.commit()
        return user

    def test_schedules_purge_after_the_retention_period(self, db_session: Session) -> None:
        service, user_service = self._service(db_session)
        user = self._google_user(db_session, user_service)
        user_id = user.id

        service.delete_account(user)

        with TestSessionLocal() as other:
            assert other.get(User, user_id) is None
            purges = other.scalars(select(AccountPhotoPurge)).all()
        assert [(p.user_id, p.requested_at, p.purge_after) for p in purges] == [
            (user_id, _FIXED_NOW, _FIXED_NOW + timedelta(days=30))
        ]

    def test_failed_deletion_leaves_no_purge(self, db_session: Session) -> None:
        service, user_service = self._service(db_session)
        user = self._google_user(db_session, user_service)
        user_id = user.id

        with (
            mock.patch.object(UserRepository, "delete", side_effect=RuntimeError("boom")),
            pytest.raises(RuntimeError),
        ):
            service.delete_account(user)
        db_session.rollback()

        with TestSessionLocal() as other:
            assert other.get(User, user_id) is not None
            assert other.scalars(select(AccountPhotoPurge)).all() == []

    def test_existing_purge_for_the_same_user_is_kept(self, db_session: Session) -> None:
        """並行した削除で予約が先に入っていても、一意制約違反で削除を失敗させない。"""
        service, user_service = self._service(db_session)
        user = self._google_user(db_session, user_service)
        user_id = user.id
        earlier = _FIXED_NOW - timedelta(minutes=1)
        db_session.add(
            AccountPhotoPurge(user_id=user_id, requested_at=earlier, purge_after=earlier)
        )
        db_session.commit()

        service.delete_account(user)

        with TestSessionLocal() as other:
            assert other.get(User, user_id) is None
            purge = other.get(AccountPhotoPurge, user_id)
            assert purge is not None
            assert purge.purge_after == earlier

import logging
from dataclasses import dataclass
from datetime import UTC, datetime
from unittest import mock

import pytest
from psycopg.errors import DeadlockDetected, ForeignKeyViolation
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError, OperationalError
from sqlalchemy.orm import Session

from sanposcape.auth.exceptions import (
    InvalidRefreshTokenError,
    RefreshTokenReuseDetectedError,
    UnsupportedProviderError,
)
from sanposcape.auth.models import RefreshToken
from sanposcape.auth.providers.base import ProviderIdentity
from sanposcape.auth.repository import RefreshTokenRepository
from sanposcape.auth.service import AuthService
from sanposcape.auth.tests.conftest import APPLE_AUDIENCE, FakeAppleSignInClient
from sanposcape.auth.tokens import hash_refresh_token
from sanposcape.config import Settings
from sanposcape.conftest import TestSessionLocal
from sanposcape.integrations.apple.exceptions import AppleSignInUnavailableError
from sanposcape.users.models import AppleAuthorization, User
from sanposcape.users.repository import UserRepository
from sanposcape.users.service import UserService


@dataclass
class _FakeGoogleProvider:
    name: str = "google"

    def verify(self, id_token: str, *, nonce: str | None = None) -> ProviderIdentity:
        return ProviderIdentity(
            provider="google",
            subject=id_token,  # テストの簡略化のため id_token をそのまま subject として使う
            email=f"{id_token}@example.com",
            display_name=id_token,
            photo_url=None,
        )


@dataclass
class _FakeAppleProvider:
    name: str = "apple"

    def verify(self, id_token: str, *, nonce: str | None = None) -> ProviderIdentity:
        return ProviderIdentity(
            provider="apple",
            subject=id_token,
            email=None,
            display_name=None,
            photo_url=None,
            audience=APPLE_AUDIENCE,
        )


def _make_service(
    db_session: Session,
    *,
    auth_mode: str = "real",
    now: datetime | None = None,
    apple_sign_in_client: FakeAppleSignInClient | None = None,
    include_apple: bool = False,
    user_service: UserService | None = None,
) -> AuthService:
    settings = Settings(
        env="test",
        auth_mode=auth_mode,
        auth_jwt_secret="x" * 32,
        google_allowed_audiences=["test-audience"],
    )
    user_repository = UserRepository(db_session)
    return AuthService(
        db_session,
        user_service or UserService(db_session, user_repository),
        RefreshTokenRepository(db_session),
        {
            "google": _FakeGoogleProvider(),
            **({"apple": _FakeAppleProvider()} if include_apple else {}),
        },
        settings,
        now=(now and (lambda: now)) or (lambda: datetime.now(UTC)),
        apple_sign_in_client=apple_sign_in_client,
    )


class _UserServiceWhoseTokenStoreFails(UserService):
    """保存だけが本物の DB エラーで失敗する（テーブルが無い migrate 前の空白を模す）。"""

    def save_apple_authorization(self, user_id, *, client_id: str, refresh_token: str) -> None:
        self._db.execute(text("INSERT INTO apple_authorizations_that_does_not_exist VALUES (1)"))


class TestAppleAuthorizationExchange:
    def test_exchange_happens_before_the_db_transaction_starts(self, db_session: Session) -> None:
        """外部 HTTP（Apple）の間に DB のトランザクション（pooled 接続）を握らない。"""
        observed: list[bool] = []
        client = FakeAppleSignInClient(
            subject="apple-sub-1", on_exchange=lambda: observed.append(db_session.in_transaction())
        )
        service = _make_service(db_session, apple_sign_in_client=client, include_apple=True)

        service.create_session("apple", "apple-sub-1", nonce="n", authorization_code="code-1")

        assert observed == [False]
        assert client.exchange_calls == [("code-1", APPLE_AUDIENCE)]

    def test_saves_refresh_token_with_client_id(self, db_session: Session) -> None:
        client = FakeAppleSignInClient(subject="apple-sub-1")
        service = _make_service(db_session, apple_sign_in_client=client, include_apple=True)

        session = service.create_session(
            "apple", "apple-sub-1", nonce="n", authorization_code="code-1"
        )

        row = db_session.get(AppleAuthorization, session.user.id)
        assert row is not None
        assert (row.client_id, row.refresh_token) == (APPLE_AUDIENCE, "refresh-token-for-code-1")

    def test_exchange_failure_still_issues_a_session(self, db_session: Session) -> None:
        client = FakeAppleSignInClient(
            exchange_error=AppleSignInUnavailableError("down", reason="http_5xx")
        )
        service = _make_service(db_session, apple_sign_in_client=client, include_apple=True)

        session = service.create_session(
            "apple", "apple-sub-1", nonce="n", authorization_code="code-1"
        )

        assert session.access_token
        assert session.refresh_token
        assert db_session.scalars(select(AppleAuthorization)).all() == []

    def test_store_failure_still_issues_a_session_and_keeps_the_user(
        self, db_session: Session, caplog
    ) -> None:
        """保存の失敗は SAVEPOINT で閉じ込める。ユーザー作成とセッション発行は巻き込まない。"""
        client = FakeAppleSignInClient(subject="apple-sub-1")
        service = _make_service(
            db_session,
            apple_sign_in_client=client,
            include_apple=True,
            user_service=_UserServiceWhoseTokenStoreFails(db_session, UserRepository(db_session)),
        )

        with caplog.at_level(logging.DEBUG, logger="sanposcape.auth.service"):
            session = service.create_session(
                "apple", "apple-sub-1", nonce="n", authorization_code="code-1"
            )

        assert session.access_token
        assert session.refresh_token
        with TestSessionLocal() as other:  # commit 済みの状態を別セッションから確かめる
            assert other.get(User, session.user.id) is not None
            assert other.scalars(select(RefreshToken)).all() != []
            assert other.scalars(select(AppleAuthorization)).all() == []
        records = [r for r in caplog.records if r.name == "sanposcape.auth.service"]
        assert [r.levelno for r in records] == [logging.WARNING]
        assert "ProgrammingError" in caplog.text
        assert "refresh-token-for-code-1" not in caplog.text
        assert "apple_authorizations_that_does_not_exist" not in caplog.text

    def test_no_code_means_no_exchange(self, db_session: Session) -> None:
        client = FakeAppleSignInClient(subject="apple-sub-1")
        service = _make_service(db_session, apple_sign_in_client=client, include_apple=True)

        service.create_session("apple", "apple-sub-1", nonce="n")

        assert client.exchange_calls == []

    def test_works_without_an_apple_client(self, db_session: Session) -> None:
        service = _make_service(db_session, include_apple=True)

        session = service.create_session(
            "apple", "apple-sub-1", nonce="n", authorization_code="code-1"
        )

        assert session.access_token

    def test_google_ignores_authorization_code(self, db_session: Session) -> None:
        client = FakeAppleSignInClient()
        service = _make_service(db_session, apple_sign_in_client=client, include_apple=True)

        service.create_session("google", "google-sub-1", authorization_code="code-1")

        assert client.exchange_calls == []


def test_reuse_detection_revokes_whole_family(db_session: Session) -> None:
    service = _make_service(db_session)
    session = service.create_session("google", "google-sub-1")
    rotated = service.refresh(session.refresh_token)

    with pytest.raises(RefreshTokenReuseDetectedError):
        service.refresh(session.refresh_token)  # 使用済みトークンの再送

    rows = db_session.scalars(select(RefreshToken)).all()
    assert len(rows) == 2
    assert all(row.revoked_reason == "reuse_detected" for row in rows)
    assert all(row.revoked_at is not None for row in rows)
    # 直前に発行された新トークンも同じ family として失効している
    assert {row.family_id for row in rows} == {rows[0].family_id}
    assert rotated.refresh_token != session.refresh_token


def test_rotation_sets_used_at(db_session: Session) -> None:
    service = _make_service(db_session)
    session = service.create_session("google", "google-sub-1")

    service.refresh(session.refresh_token)

    rows = db_session.scalars(select(RefreshToken)).all()
    used_rows = [r for r in rows if r.used_at is not None]
    assert len(used_rows) == 1


def test_refresh_foreign_key_failure_rolls_back_and_leaves_original_token_usable(
    db_session: Session,
) -> None:
    service = _make_service(db_session)
    session = service.create_session("google", "google-sub-1")
    foreign_key_error = IntegrityError("INSERT INTO refresh_tokens ...", {}, ForeignKeyViolation())

    with (
        mock.patch.object(RefreshTokenRepository, "create", side_effect=foreign_key_error),
        pytest.raises(InvalidRefreshTokenError),
    ):
        service.refresh(session.refresh_token)

    original = db_session.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_refresh_token(session.refresh_token)
        )
    )
    assert original is not None
    assert original.used_at is None
    assert db_session.scalar(select(RefreshToken).where(RefreshToken.id == original.id)) is original

    rotated = service.refresh(session.refresh_token)
    assert rotated.refresh_token != session.refresh_token


def test_refresh_retries_once_after_deadlock_and_rotates_token_once(db_session: Session) -> None:
    service = _make_service(db_session)
    session = service.create_session("google", "google-sub-1")
    deadlock_error = OperationalError("INSERT INTO refresh_tokens ...", {}, DeadlockDetected())
    original_create = RefreshTokenRepository.create
    create_calls = 0

    def _create_with_one_deadlock(repository: RefreshTokenRepository, *args, **kwargs) -> None:
        nonlocal create_calls
        create_calls += 1
        if create_calls == 1:
            raise deadlock_error
        original_create(repository, *args, **kwargs)

    with mock.patch.object(
        RefreshTokenRepository, "create", autospec=True, side_effect=_create_with_one_deadlock
    ):
        rotated = service.refresh(session.refresh_token)

    rows = db_session.scalars(select(RefreshToken)).all()
    assert create_calls == 2
    assert len(rows) == 2
    assert len([row for row in rows if row.used_at is not None]) == 1
    assert rotated.refresh_token != session.refresh_token


def test_refresh_reraises_non_deadlock_operational_error_after_rollback(
    db_session: Session,
) -> None:
    service = _make_service(db_session)
    session = service.create_session("google", "google-sub-1")
    operational_error = OperationalError(
        "INSERT INTO refresh_tokens ...", {}, OSError("network down")
    )

    with (
        mock.patch.object(RefreshTokenRepository, "create", side_effect=operational_error),
        pytest.raises(OperationalError),
    ):
        service.refresh(session.refresh_token)

    original = db_session.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_refresh_token(session.refresh_token)
        )
    )
    assert original is not None
    assert original.used_at is None


def test_refresh_reraises_second_deadlock_after_rollback(db_session: Session) -> None:
    service = _make_service(db_session)
    session = service.create_session("google", "google-sub-1")
    deadlock_error = OperationalError("INSERT INTO refresh_tokens ...", {}, DeadlockDetected())

    with (
        mock.patch.object(
            RefreshTokenRepository, "create", side_effect=deadlock_error
        ) as create_mock,
        pytest.raises(OperationalError),
    ):
        service.refresh(session.refresh_token)

    assert create_mock.call_count == 2
    original = db_session.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == hash_refresh_token(session.refresh_token)
        )
    )
    assert original is not None
    assert original.used_at is None


def test_auth_service_has_no_direct_user_repository(db_session: Session) -> None:
    """A-3: `AuthService` は `UserRepository` を直接持たない（`auth -> users` へのアクセスは
    常に `UserService` 経由という単一境界を回復する）。

    以前は `AuthService.__init__` に `user_repository` が渡され、`refresh()` が
    `self._user_repository.get_by_id(...)` を直接呼んでいた。これ自体は動くが、SS-12 で
    「退会済み/BAN済みユーザーを弾く」判定を `get_current_user` にだけ足すと、`refresh()` は
    素通りしてトークンを発行し続けてしまう認可漏れリスクがあった。
    """
    service = _make_service(db_session)

    assert not hasattr(service, "_user_repository")


def test_refresh_resolves_user_via_user_service(db_session: Session) -> None:
    """A-3: `refresh()` はユーザー引き当てを `UserService.get_by_id()` 経由で行う。

    SS-12 で `UserService.get_by_id()` に「削除済みなら None を返す」等の判定を足すだけで、
    `get_current_user` と `AuthService.refresh()` の双方に効くことの前提を保証する。
    """
    service = _make_service(db_session)
    session = service.create_session("google", "google-sub-1")

    with mock.patch.object(
        UserService, "get_by_id", autospec=True, side_effect=UserService.get_by_id
    ) as get_by_id_spy:
        service.refresh(session.refresh_token)

    get_by_id_spy.assert_called_once()
    _self_arg, called_user_id = get_by_id_spy.call_args.args
    assert called_user_id == session.user.id


def test_create_dev_session_raises_when_auth_mode_is_real(db_session: Session) -> None:
    service = _make_service(db_session, auth_mode="real")

    with pytest.raises(RuntimeError):
        service.create_dev_session("dev-user-1")


def test_resolve_user_and_issue_session_shared_between_real_and_dev(db_session: Session) -> None:
    service = _make_service(db_session, auth_mode="dev")

    with (
        mock.patch.object(
            AuthService, "_resolve_user", autospec=True, side_effect=AuthService._resolve_user
        ) as resolve_spy,
        mock.patch.object(
            AuthService, "_issue_session", autospec=True, side_effect=AuthService._issue_session
        ) as issue_spy,
    ):
        service.create_session("google", "google-sub-1")
        service.create_dev_session("dev-user-1")

    assert resolve_spy.call_count == 2
    assert issue_spy.call_count == 2


def test_create_session_uses_display_name_only_for_new_user(db_session: Session) -> None:
    service = _make_service(db_session)

    # _FakeGoogleProvider は display_name を id_token と同じ値で返すので、
    # 引数の display_name は優先されない
    first = service.create_session("google", "google-sub-1", display_name="端末の名前")

    assert first.user.display_name == "google-sub-1"


def test_create_session_passes_nonce_to_provider(db_session: Session) -> None:
    received: dict[str, str | None] = {}

    @dataclass
    class _Recording:
        name: str = "apple"

        def verify(self, id_token: str, *, nonce: str | None = None) -> ProviderIdentity:
            received["nonce"] = nonce
            return ProviderIdentity("apple", id_token, None, None, None)

    service = _make_service(db_session)
    service._providers["apple"] = _Recording()

    result = service.create_session("apple", "apple-sub-1", nonce="n" * 16, display_name="山田")

    assert received["nonce"] == "n" * 16
    assert result.user.provider == "apple"
    assert result.user.display_name == "山田"


def test_create_session_with_unconfigured_provider_raises_unsupported(
    db_session: Session,
) -> None:
    service = _make_service(db_session)

    with pytest.raises(UnsupportedProviderError):
        service.create_session("apple", "apple-sub-1", nonce="n" * 16)

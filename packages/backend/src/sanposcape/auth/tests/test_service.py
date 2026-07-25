from dataclasses import dataclass
from datetime import UTC, datetime
from unittest import mock

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from sanposcape.auth.exceptions import RefreshTokenReuseDetectedError
from sanposcape.auth.models import RefreshToken
from sanposcape.auth.providers.base import ProviderIdentity
from sanposcape.auth.repository import RefreshTokenRepository
from sanposcape.auth.service import AuthService
from sanposcape.config import Settings
from sanposcape.users.repository import UserRepository
from sanposcape.users.service import UserService


@dataclass
class _FakeGoogleProvider:
    name: str = "google"

    def verify(self, id_token: str) -> ProviderIdentity:
        return ProviderIdentity(
            provider="google",
            subject=id_token,  # テストの簡略化のため id_token をそのまま subject として使う
            email=f"{id_token}@example.com",
            display_name=id_token,
            photo_url=None,
        )


def _make_service(
    db_session: Session, *, auth_mode: str = "real", now: datetime | None = None
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
        UserService(db_session, user_repository),
        RefreshTokenRepository(db_session),
        {"google": _FakeGoogleProvider()},
        settings,
        now=(now and (lambda: now)) or (lambda: datetime.now(UTC)),
    )


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

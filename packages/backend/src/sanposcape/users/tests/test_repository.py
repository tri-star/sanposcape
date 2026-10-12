from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from sanposcape.auth.models import RefreshToken
from sanposcape.users.models import AppleAuthorization, User
from sanposcape.users.repository import AppleAuthorizationRepository, UserRepository


def test_create_with_duplicate_provider_subject_returns_existing_user(
    db_session: Session,
) -> None:
    """A-2: `UniqueConstraint("provider", "provider_subject")` に違反した場合、savepoint 内で
    `IntegrityError` を吸収して既存行を再取得する（insert → on conflict → re-select）。

    `UserService.find_or_create()` の check-then-act（存在確認 → 無ければ create）は
    同時に2本同じ `(provider, provider_subject)` で走ると両方が「未登録」と判定してしまう
    競合を持つため、`create()` 単体でもこの競合を吸収できる必要がある。
    """
    repo = UserRepository(db_session)
    first = repo.create(
        provider="google",
        provider_subject="dup-sub",
        email="a@example.com",
        display_name="A",
        photo_url=None,
    )

    second = repo.create(
        provider="google",
        provider_subject="dup-sub",
        email="b@example.com",
        display_name="B",
        photo_url=None,
    )

    assert second.id == first.id


def test_create_conflict_does_not_roll_back_outer_transaction(db_session: Session) -> None:
    """savepoint（`db.begin_nested()`）で衝突を吸収するため、外側のトランザクションで
    その後に行う操作（別ユーザーの作成）が壊れないことを検証する。

    素の `db.rollback()` を使う実装だと、ここで外側のトランザクション全体が巻き戻り、
    以降の `other` の作成も一緒に失われてしまう。
    """
    repo = UserRepository(db_session)
    repo.create(
        provider="google",
        provider_subject="dup-sub",
        email="a@example.com",
        display_name="A",
        photo_url=None,
    )
    repo.create(
        provider="google",
        provider_subject="dup-sub",
        email="b@example.com",
        display_name="B",
        photo_url=None,
    )

    other = repo.create(
        provider="google",
        provider_subject="other-sub",
        email="c@example.com",
        display_name="C",
        photo_url=None,
    )

    assert other.provider_subject == "other-sub"
    # 外側のトランザクションがまだ有効であることの証明（壊れていれば commit で例外になる）
    db_session.commit()


def test_delete_cascades_only_deleted_users_refresh_tokens(db_session: Session) -> None:
    repo = UserRepository(db_session)
    deleted_user = repo.create(
        provider="google",
        provider_subject="delete-me",
        email=None,
        display_name=None,
        photo_url=None,
    )
    remaining_user = repo.create(
        provider="google",
        provider_subject="keep-me",
        email=None,
        display_name=None,
        photo_url=None,
    )
    expiry = datetime.now(UTC) + timedelta(days=1)
    deleted_token = RefreshToken(
        user_id=deleted_user.id,
        token_hash="a" * 64,
        family_id=deleted_user.id,
        expires_at=expiry,
    )
    remaining_token = RefreshToken(
        user_id=remaining_user.id,
        token_hash="b" * 64,
        family_id=remaining_user.id,
        expires_at=expiry,
    )
    db_session.add_all([deleted_token, remaining_token])
    db_session.commit()

    repo.delete(deleted_user)
    db_session.commit()

    assert db_session.get(type(deleted_user), deleted_user.id) is None
    assert db_session.get(type(remaining_user), remaining_user.id) is not None
    assert (
        db_session.scalars(
            select(RefreshToken).where(RefreshToken.user_id == deleted_user.id)
        ).all()
        == []
    )
    assert (
        db_session.scalars(select(RefreshToken).where(RefreshToken.user_id == remaining_user.id))
        .one()
        .id
        == remaining_token.id
    )


class TestAppleAuthorizationRepository:
    def _user(self, db_session: Session) -> User:
        user = User(provider="apple", provider_subject="apple-sub-1")
        db_session.add(user)
        db_session.commit()
        return user

    def test_upsert_inserts_a_row(self, db_session: Session) -> None:
        user = self._user(db_session)
        repository = AppleAuthorizationRepository(db_session)

        repository.upsert(user.id, client_id="com.sanposcape.app.dev", refresh_token="r1")
        db_session.commit()

        row = repository.get(user.id)
        assert row is not None
        assert (row.client_id, row.refresh_token) == ("com.sanposcape.app.dev", "r1")

    def test_upsert_overwrites_existing_row_and_keeps_one_row(self, db_session: Session) -> None:
        user = self._user(db_session)
        repository = AppleAuthorizationRepository(db_session)
        repository.upsert(user.id, client_id="old.client", refresh_token="r1")
        db_session.commit()
        first = repository.get(user.id)
        assert first is not None
        created_at, first_updated_at = first.created_at, first.updated_at

        repository.upsert(user.id, client_id="new.client", refresh_token="r2")
        db_session.commit()

        rows = db_session.scalars(select(AppleAuthorization)).all()
        assert len(rows) == 1
        row = repository.get(user.id)
        assert row is not None
        assert (row.client_id, row.refresh_token) == ("new.client", "r2")
        assert row.created_at == created_at
        assert row.updated_at > first_updated_at

    def test_get_returns_none_when_absent(self, db_session: Session) -> None:
        user = self._user(db_session)

        assert AppleAuthorizationRepository(db_session).get(user.id) is None

    def test_deleting_user_cascades_to_the_row(self, db_session: Session) -> None:
        user = self._user(db_session)
        repository = AppleAuthorizationRepository(db_session)
        repository.upsert(user.id, client_id="c", refresh_token="r1")
        db_session.commit()

        UserRepository(db_session).delete(user)
        db_session.commit()

        assert db_session.scalars(select(AppleAuthorization)).all() == []

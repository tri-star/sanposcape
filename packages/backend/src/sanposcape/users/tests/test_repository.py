from sqlalchemy.orm import Session

from sanposcape.users.repository import UserRepository


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

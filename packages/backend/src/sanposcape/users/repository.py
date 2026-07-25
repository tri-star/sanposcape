import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from sanposcape.users.models import User


class UserRepository:
    """users テーブルへの DB アクセスを隔離する層。"""

    def __init__(self, db: Session) -> None:
        self._db = db

    def get_by_id(self, user_id: uuid.UUID) -> User | None:
        return self._db.get(User, user_id)

    def get_by_provider_subject(self, provider: str, provider_subject: str) -> User | None:
        stmt = select(User).where(
            User.provider == provider,
            User.provider_subject == provider_subject,
        )
        return self._db.scalars(stmt).first()

    def create(
        self,
        *,
        provider: str,
        provider_subject: str,
        email: str | None,
        display_name: str | None,
        photo_url: str | None,
    ) -> User:
        user = User(
            provider=provider,
            provider_subject=provider_subject,
            email=email,
            display_name=display_name,
            photo_url=photo_url,
        )
        self._db.add(user)
        self._db.flush()
        self._db.refresh(user)
        return user

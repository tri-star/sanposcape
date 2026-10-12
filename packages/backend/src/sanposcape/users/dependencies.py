from fastapi import Depends, Request
from sqlalchemy.orm import Session

from sanposcape.database import get_db
from sanposcape.integrations.apple.client import AppleSignInClient
from sanposcape.users.repository import UserRepository
from sanposcape.users.service import UserService


def get_user_service(db: Session = Depends(get_db)) -> UserService:
    """request-scoped session を使う UserService を供給する。"""
    return UserService(db, UserRepository(db))


def get_apple_sign_in_client(request: Request) -> AppleSignInClient:
    """App-lifespan singleton（`get_object_storage` と同じ形）。

    テストはこの依存を `dependency_overrides` で Fake に差し替え、Apple に出ないようにする。
    `auth` と `users` の両方が使うため、ここ（`auth -> users` の向きで import できる側）に置く。
    """
    return request.app.state.apple_sign_in_client

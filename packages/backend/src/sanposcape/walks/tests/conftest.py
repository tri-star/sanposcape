from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from sanposcape.auth.tokens import create_access_token
from sanposcape.config import Settings, get_settings
from sanposcape.main import app
from sanposcape.users.models import User


def make_user(db_session: Session, *, subject: str) -> User:
    """`provider="dev"` の User を1行 INSERT する共有ヘルパー。

    `users/tests/conftest.py` の `auth_client` は Google JWKS の fake を経由する
    `/auth/session` 実行が必要で重いため、walks のテストでは使わない。
    `test_repository.py` / `test_service.py` / `test_router.py` から共通で使う
    （モジュール内専用を示す `_` 接頭辞は付けない）。
    """
    user = User(
        provider="dev",
        provider_subject=subject,
        email=f"{subject}@dev.local",
        display_name=subject,
        photo_url=None,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def authenticated_user(db_session: Session) -> User:
    return make_user(db_session, subject="walks-test-user")


@pytest.fixture
def auth_headers(authenticated_user: User, test_settings: Settings) -> dict[str, str]:
    token, _ = create_access_token(user_id=authenticated_user.id, settings=test_settings)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def walks_client(client: TestClient, test_settings: Settings) -> Generator[TestClient, None, None]:
    """`test_settings`（AUTH_MODE=real）を明示注入した TestClient。

    ambient な `.env`（AUTH_MODE=dev が既定）に依存すると CI とローカルで結果が
    変わるため、認証まわりのテストは常にこの fixture を使う。
    """
    app.dependency_overrides[get_settings] = lambda: test_settings
    yield client
    app.dependency_overrides.pop(get_settings, None)

import uuid
from collections.abc import Generator
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from fastapi import Depends
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from sanposcape.auth.tokens import create_access_token
from sanposcape.config import Settings, get_settings
from sanposcape.database import get_db
from sanposcape.main import app
from sanposcape.users.models import User
from sanposcape.walks.dependencies import get_walk_service
from sanposcape.walks.models import Walk
from sanposcape.walks.repository import WalkRepository
from sanposcape.walks.service import WalkService

# 全 stats テストが共有する固定アンカー。実行日に依存させないため、
# 投入データも期待値もすべてこの値からの相対で組み立てる（日曜 12:00 JST）。
STATS_ANCHOR_JST = datetime(2026, 3, 15, 12, 0, tzinfo=ZoneInfo("Asia/Tokyo"))
STATS_ANCHOR_UTC = STATS_ANCHOR_JST.astimezone(UTC)


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


def seed_walk(
    db_session: Session,
    *,
    user_id: uuid.UUID,
    started_at: datetime,
    duration_seconds: int = 600,
    distance_meters: int = 1000,
    track_points: list | None = None,
) -> Walk:
    """`WalkRepository.create()` 直呼びで散歩を1件投入して commit する。

    `POST /walks` を使わないのは、`WalkCreate` の未来日付バリデーションが
    実時刻 `datetime.now()` を直接見ており、固定アンカーと噛み合わないため
    （3.3 節）。stats テストのデータ投入は必ずこのヘルパーを使う。
    """
    repo = WalkRepository(db_session)
    walk, _ = repo.create(
        user_id=user_id,
        client_walk_id=uuid.uuid4(),
        started_at=started_at,
        ended_at=started_at + timedelta(minutes=10),
        duration_seconds=duration_seconds,
        distance_meters=distance_meters,
        destination_place_id="place-1",
        destination_name="テスト公園",
        destination_latitude=35.68,
        destination_longitude=139.76,
        track_points=track_points if track_points is not None else [],
    )
    db_session.commit()
    return walk


@pytest.fixture
def frozen_stats_client(walks_client: TestClient) -> Generator[TestClient, None, None]:
    """`get_walk_service` を固定クロック版に差し替えた `TestClient`。

    `STATS_ANCHOR_UTC` を「今日」の基準にするため、`GET /walks/stats` を叩く
    router テストはこの fixture を使う。`walks_client`（`test_settings` 注入済み）を
    土台にするのは、`auth_headers` が `test_settings` の秘密鍵で署名したトークンを
    使うため（ambient な `client` だと秘密鍵が食い違い 401 になる）。
    """

    def _factory(db: Session = Depends(get_db)) -> WalkService:
        return WalkService(db, WalkRepository(db), now=lambda: STATS_ANCHOR_UTC)

    app.dependency_overrides[get_walk_service] = _factory
    yield walks_client
    app.dependency_overrides.pop(get_walk_service, None)

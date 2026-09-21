import io
import uuid
from collections.abc import Generator
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.orm import Session

from sanposcape.auth.tokens import create_access_token
from sanposcape.config import Settings, get_settings
from sanposcape.conftest import override_get_db
from sanposcape.database import get_db
from sanposcape.integrations.aws.s3 import FakeObjectStorage
from sanposcape.main import create_app
from sanposcape.pins.models import PinPhotoUpload
from sanposcape.pins.photo_keys import staging_key
from sanposcape.users.models import User


def make_user(db_session: Session, *, subject: str) -> User:
    """`provider="dev"` の User を1行 INSERT する共有ヘルパー（walks/tests/conftest.py と同じ）。"""
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
    return make_user(db_session, subject="pins-test-user")


@pytest.fixture
def auth_headers(authenticated_user: User, test_settings: Settings) -> dict[str, str]:
    token, _ = create_access_token(user_id=authenticated_user.id, settings=test_settings)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def fake_storage_settings() -> Settings:
    """`STORAGE_MODE=fake` を明示構築した設定（`AUTH_MODE=real` はテスト共通の既定と同じ）。"""
    return Settings(
        env="test",
        auth_mode="real",
        auth_jwt_secret="x" * 32,
        google_allowed_audiences=["test-audience"],
        storage_mode="fake",
    )


@pytest.fixture
def fake_storage_client(
    fake_storage_settings: Settings,
) -> Generator[tuple[TestClient, FakeObjectStorage], None, None]:
    """`STORAGE_MODE=fake` で組み立てた専用アプリの `TestClient`（`main.conftest.dev_client`
    と同じ形）。写真 API のテストは `client`（ambient app）ではなくこちらを使う
    （ambient app は `.env` の `STORAGE_MODE` 次第で real/fake が揺れるため）。
    """
    test_app = create_app(fake_storage_settings)
    test_app.dependency_overrides[get_db] = override_get_db
    test_app.dependency_overrides[get_settings] = lambda: fake_storage_settings
    with TestClient(test_app) as test_client:
        storage = test_app.state.object_storage
        assert isinstance(storage, FakeObjectStorage)
        yield test_client, storage
    test_app.dependency_overrides.clear()


@pytest.fixture
def unconfigured_storage_client(test_settings: Settings) -> Generator[TestClient, None, None]:
    """`test_settings`（`STORAGE_MODE` 未指定 = real、バケット名未設定）で組み立てたアプリの
    `TestClient`。写真 API が 503 になる経路のテストに使う（ambient app は `.env` の
    `STORAGE_MODE` に依存させたくないため使わない）。
    """
    test_app = create_app(test_settings)
    test_app.dependency_overrides[get_db] = override_get_db
    test_app.dependency_overrides[get_settings] = lambda: test_settings
    with TestClient(test_app) as test_client:
        yield test_client
    test_app.dependency_overrides.clear()


def make_jpeg_bytes(size: tuple[int, int] = (100, 100), *, color: str = "red") -> bytes:
    image = Image.new("RGB", size, color=color)
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG")
    return buffer.getvalue()


def seed_staging_photo(
    storage: FakeObjectStorage,
    *,
    user_id: uuid.UUID,
    upload_id: uuid.UUID,
    size: tuple[int, int] = (100, 100),
) -> bytes:
    """`FakeObjectStorage` の staging/ に直接 JPEG を置く（presigned POST の HTTP 往復を
    経由しない、router/service テスト用の近道）。HTTP 経由の往復自体は
    `test_dev_storage_router.py` / `test_upload_router.py` で別途検証する。
    """
    data = make_jpeg_bytes(size)
    storage.put_bytes(
        staging_key(user_id=user_id, upload_id=upload_id), data, content_type="image/jpeg"
    )
    return data


def create_upload_row(
    db_session: Session,
    *,
    user_id: uuid.UUID,
    upload_id: uuid.UUID | None = None,
    declared_byte_size: int = 1024,
    status: str = "pending",
    expires_at: datetime | None = None,
) -> PinPhotoUpload:
    """`pin_photo_uploads` に直接1行 INSERT する（`PinPhotoUploadService` を経由しない）。"""
    upload_id = upload_id or uuid.uuid4()
    upload = PinPhotoUpload(
        id=upload_id,
        user_id=user_id,
        s3_key=staging_key(user_id=user_id, upload_id=upload_id),
        content_type="image/jpeg",
        declared_byte_size=declared_byte_size,
        status=status,
        expires_at=expires_at or (datetime.now(UTC) + timedelta(hours=1)),
    )
    db_session.add(upload)
    db_session.commit()
    db_session.refresh(upload)
    return upload

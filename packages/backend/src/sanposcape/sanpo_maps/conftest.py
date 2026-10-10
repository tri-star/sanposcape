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
from sanposcape.main import app, create_app
from sanposcape.sanpo_maps.maps.access import SanpoMapAccess
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.models import PinPhoto, PinPhotoUpload, PinTag
from sanposcape.sanpo_maps.photos.cleanup import PhotoObjectCleaner
from sanposcape.sanpo_maps.photos.photo_attacher import PhotoAttacher
from sanposcape.sanpo_maps.photos.photo_keys import original_key, staging_key, thumbnail_key
from sanposcape.sanpo_maps.photos.repository import PinPhotoUploadRepository
from sanposcape.sanpo_maps.pins.repository import PinRepository
from sanposcape.sanpo_maps.pins.service import PinService
from sanposcape.sanpo_maps.pins.tag_labels import tag_key
from sanposcape.users.models import User

#: `TestClient` の既定 base URL（サービス直呼びのテストが `base_url` に渡す）。
BASE_URL = "http://testserver/"


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


def make_sanpo_map(db_session: Session, *, owner_user_id: uuid.UUID) -> uuid.UUID:
    """所有者1名だけの地図を作る共有ヘルパー（`maps/`・`pins/`・`photos/` のテストで使う）。"""
    sanpo_map, _ = SanpoMapRepository(db_session).create_with_owner(
        owner_user_id=owner_user_id, name="テスト地図", is_default=True
    )
    db_session.commit()
    return sanpo_map.id


@pytest.fixture
def authenticated_user(db_session: Session) -> User:
    return make_user(db_session, subject="sanpo-maps-test-user")


@pytest.fixture
def auth_headers(authenticated_user: User, test_settings: Settings) -> dict[str, str]:
    token, _ = create_access_token(user_id=authenticated_user.id, settings=test_settings)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def sanpo_maps_client(
    client: TestClient, test_settings: Settings
) -> Generator[TestClient, None, None]:
    """`test_settings`（AUTH_MODE=real）を明示注入した TestClient（walks_client と同じ形）。"""
    app.dependency_overrides[get_settings] = lambda: test_settings
    yield client
    app.dependency_overrides.pop(get_settings, None)


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
def fake_storage_small_limit_client() -> Generator[TestClient, None, None]:
    """`STORAGE_MODE=fake` + `pin_photo_max_bytes` を最小値(1MiB)にした設定の `TestClient`。

    `/dev-storage/uploads` の本文上限テスト（PR #93 T2）で、巨大な body を実際に
    アロケートせずに 413 を再現するために使う（`fake_storage_client` の既定
    10MiB のままだと、413 を踏むためだけに10MiB超のバイト列をテストごとに
    確保することになる）。
    """
    settings = Settings(
        env="test",
        auth_mode="real",
        auth_jwt_secret="x" * 32,
        google_allowed_audiences=["test-audience"],
        storage_mode="fake",
        pin_photo_max_bytes=1_048_576,
    )
    test_app = create_app(settings)
    test_app.dependency_overrides[get_db] = override_get_db
    test_app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(test_app) as test_client:
        yield test_client
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


@pytest.fixture
def fake_storage_tiny_quota_client() -> Generator[tuple[TestClient, FakeObjectStorage], None, None]:
    """`STORAGE_MODE=fake` + `pin_photo_user_quota_bytes` を極小(1バイト)にした設定の
    `TestClient`（`fake_storage_client` と同じ形）。`StorageQuotaExceededError`（409）を
    狙って再現するために使う（PR #93 T15 の `code` フィールドのテスト）。
    """
    settings = Settings(
        env="test",
        auth_mode="real",
        auth_jwt_secret="x" * 32,
        google_allowed_audiences=["test-audience"],
        storage_mode="fake",
        pin_photo_user_quota_bytes=1,
    )
    test_app = create_app(settings)
    test_app.dependency_overrides[get_db] = override_get_db
    test_app.dependency_overrides[get_settings] = lambda: settings
    with TestClient(test_app) as test_client:
        storage = test_app.state.object_storage
        assert isinstance(storage, FakeObjectStorage)
        yield test_client, storage
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
    `test_dev_storage_router.py` / `test_router.py`（旧 `test_upload_router.py`）で
    別途検証する。
    """
    data = make_jpeg_bytes(size)
    storage.put_bytes(
        staging_key(user_id=user_id, upload_id=upload_id), data, content_type="image/jpeg"
    )
    return data


def create_pin_photo_row(
    db_session: Session,
    storage: FakeObjectStorage | None,
    *,
    pin_id: uuid.UUID,
    uploaded_by_user_id: uuid.UUID,
    position: int,
    upload_id: uuid.UUID | None = None,
    with_thumbnail: bool = True,
    taken_at: datetime | None = None,
) -> PinPhoto:
    """`pin_photos` に直接1行 INSERT する（`PhotoAttacher`/確定処理を経由しない近道。

    閲覧 API のテストで大量の写真が必要な場合に使う）。
    `storage` を渡した場合は原本・サムネイルの実体も書き込み、`client.get()` で
    実際に取得できることを確認できるようにする。`storage=None`（ストレージ未構成の
    テスト）では DB 行だけを作り、実体は書き込まない。
    """
    upload_id = upload_id or uuid.uuid4()
    original = original_key(user_id=uploaded_by_user_id, upload_id=upload_id)
    thumb = thumbnail_key(user_id=uploaded_by_user_id, upload_id=upload_id, size=512)
    data = make_jpeg_bytes()
    if storage is not None:
        storage.put_bytes(original, data, content_type="image/jpeg")
        if with_thumbnail:
            storage.put_bytes(thumb, data, content_type="image/jpeg")
    photo = PinPhoto(
        pin_id=pin_id,
        uploaded_by_user_id=uploaded_by_user_id,
        upload_id=upload_id,
        s3_key=original,
        content_type="image/jpeg",
        byte_size=len(data),
        width=100,
        height=100,
        thumbnail_s3_key=thumb if with_thumbnail else None,
        thumbnail_byte_size=len(data) if with_thumbnail else None,
        thumbnail_width=100 if with_thumbnail else None,
        thumbnail_height=100 if with_thumbnail else None,
        position=position,
        taken_at=taken_at,
    )
    db_session.add(photo)
    db_session.commit()
    db_session.refresh(photo)
    return photo


def create_upload_row(
    db_session: Session,
    *,
    user_id: uuid.UUID,
    upload_id: uuid.UUID | None = None,
    declared_byte_size: int = 1024,
    status: str = "pending",
    expires_at: datetime | None = None,
    taken_at: datetime | None = None,
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
        taken_at=taken_at,
    )
    db_session.add(upload)
    db_session.commit()
    db_session.refresh(upload)
    return upload


#: `add_pin_tag()` の `created_at` の基準時刻（テスト内で相対的な前後関係を作る用）。
TAG_BASE_TIME = datetime(2026, 9, 1, tzinfo=UTC)


def create_pin_with_tags(
    db_session: Session,
    *,
    sanpo_map_id: uuid.UUID,
    user_id: uuid.UUID,
    tags: list[tuple[str, int]] | None = None,
) -> uuid.UUID:
    """ピンを1件作り、`tags`（`(label, created_at の基準からの経過分)`）を `created_at` を
    明示して直接 INSERT する。地図のタグ一覧（SS-136）の並び順・代表表記のテスト用。
    `PinRepository.add_tags()` は `created_at` を指定できず、同一トランザクションでは
    同値になるため使わない。
    """
    pin, _ = PinRepository(db_session).create(
        sanpo_map_id=sanpo_map_id,
        created_by_user_id=user_id,
        client_pin_id=uuid.uuid4(),
        name=None,
        memo=None,
        latitude=0,
        longitude=0,
        client_walk_id=None,
    )
    for label, minutes in tags or []:
        add_pin_tag(db_session, pin_id=pin.id, user_id=user_id, label=label, minutes=minutes)
    db_session.commit()
    return pin.id


def add_pin_tag(
    db_session: Session,
    *,
    pin_id: uuid.UUID,
    user_id: uuid.UUID,
    label: str,
    minutes: int = 0,
    tag_id: uuid.UUID | None = None,
) -> None:
    """`pin_tags` に `created_at = TAG_BASE_TIME + minutes 分` で1行 INSERT する（flush のみ）。"""
    db_session.add(
        PinTag(
            id=tag_id or uuid.uuid4(),
            pin_id=pin_id,
            label=label,
            label_key=tag_key(label),
            created_by_user_id=user_id,
            created_at=TAG_BASE_TIME + timedelta(minutes=minutes),
        )
    )
    db_session.flush()


def make_pin_service(db_session: Session, storage: FakeObjectStorage, **overrides) -> PinService:
    """`**overrides` のうち `photo_delete_deadline_seconds`・
    `photo_delete_call_worst_case_seconds`・`monotonic` は `PhotoObjectCleaner`
    （`PinService` ではなく削除の後始末を担う部品, ADR-011）側の引数に振り分ける。
    `photo_cleaner` を直接渡した場合はそちらを使う。
    """
    photo_cleaner = overrides.pop("photo_cleaner", None)
    if photo_cleaner is None:
        cleaner_kwargs = {
            "deadline_seconds": overrides.pop("photo_delete_deadline_seconds", 10),
            "call_worst_case_seconds": overrides.pop("photo_delete_call_worst_case_seconds", 6),
        }
        if "monotonic" in overrides:
            cleaner_kwargs["monotonic"] = overrides.pop("monotonic")
        photo_cleaner = PhotoObjectCleaner(storage, **cleaner_kwargs)
    else:
        overrides.pop("photo_delete_deadline_seconds", None)
        overrides.pop("photo_delete_call_worst_case_seconds", None)
        overrides.pop("monotonic", None)

    kwargs = {
        "user_quota_bytes": 1024**3,
        "confirm_deadline_seconds": 20,
        "read_photos_limit": 10,
        "download_url_ttl_seconds": 3600,
    }
    kwargs.update(overrides)
    photo_attacher = PhotoAttacher(
        storage,
        max_bytes=10 * 1024 * 1024,
        max_pixels=1_000_000,
        thumbnail_max_edge=512,
        thumbnail_quality=80,
        concurrency=3,
    )
    return PinService(
        db_session,
        PinRepository(db_session),
        PinPhotoUploadRepository(db_session),
        SanpoMapAccess(SanpoMapRepository(db_session)),
        photo_attacher,
        photo_cleaner,
        storage,
        **kwargs,
    )

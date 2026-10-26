"""import_bundle.py のテスト。

手で作ったバンドルを、テスト用 DB と FakeObjectStorage に読み込む。
"""

import io
import json
import logging
import uuid
from collections.abc import Callable, Generator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import bundle
import import_bundle as ib
import pytest
from PIL import Image
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from sanposcape.all_models import Base
from sanposcape.config import Settings
from sanposcape.integrations.aws.s3 import FakeObjectStorage
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.models import (
    Pin,
    PinPhoto,
    PinPhotoUpload,
    PinTag,
    SanpoMap,
    SanpoMapMember,
)
from sanposcape.sanpo_maps.photos.jpeg_metadata import strip_jpeg_metadata
from sanposcape.users.models import User

T0 = "2022-03-09T01:00:00.000000Z"
_ORIENTATION_TAG = 0x0112

# テスト用 DB の接続先は、src/sanposcape/conftest.py と同じく import（collection）の時点で決める。
# src のテストは環境変数を消した状態で get_settings() を呼ぶことがあり、そのあとのキャッシュは
# 既定値（host=db）になる。コンテナでは既定値でも繋がるが、CI（DB_HOST=localhost）では繋がらない。
_AMBIENT = Settings()


# ---------------------------------------------------------------------------
# DB・利用者・地図
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def engine() -> Generator[Engine, None, None]:
    # src/sanposcape/conftest.py の fixture はこのディレクトリに効かないので、テスト用 DB に
    # 同じモデル定義のスキーマを用意する（全体の実行では src 側が作ったものをそのまま使う）。
    engine = create_engine(_AMBIENT.test_database_url, pool_pre_ping=True)
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def session_factory(engine: Engine) -> sessionmaker[Session]:
    with engine.begin() as conn:
        # src/sanposcape/conftest.py の _delete_all と同じく、閉じ忘れたセッションで無言に
        # 止まらないようにする（ADR-B-001 決定4）。
        conn.execute(text("SET LOCAL lock_timeout = '10s'"))
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
    return sessionmaker(bind=engine, autoflush=False)


def make_user(db: Session, subject: str) -> uuid.UUID:
    user = User(
        provider="dev",
        provider_subject=subject,
        email=f"{subject}@dev.local",
        display_name=subject,
        photo_url=None,
    )
    db.add(user)
    db.commit()
    return user.id


@pytest.fixture
def owner(session_factory: sessionmaker[Session]) -> tuple[uuid.UUID, uuid.UUID]:
    """(ユーザー ID, そのユーザーが owner の地図 ID)。地図の updated_at は古い日時にしておく。"""
    with session_factory() as db:
        user_id = make_user(db, "migration-owner")
        sanpo_map, _ = SanpoMapRepository(db).create_with_owner(
            owner_user_id=user_id, name="移行先", is_default=True
        )
        sanpo_map.updated_at = datetime(2020, 1, 1, tzinfo=UTC)
        db.commit()
        return user_id, sanpo_map.id


# ---------------------------------------------------------------------------
# バンドル
# ---------------------------------------------------------------------------


def make_jpeg(size: tuple[int, int] = (64, 48), *, orientation: int | None = None) -> bytes:
    kwargs: dict[str, Any] = {"format": "JPEG", "quality": 90}
    if orientation is not None:
        exif = Image.Exif()
        exif[_ORIENTATION_TAG] = orientation
        exif[0x010F] = "Camera"  # Make。除去されるメタデータ
        kwargs["exif"] = exif.tobytes()
    out = io.BytesIO()
    Image.new("RGB", size, (10, 120, 200)).save(out, **kwargs)
    return out.getvalue()


def photo_record(source_id: str, position: int, **fields: Any) -> dict[str, Any]:
    return {
        "source_id": source_id,
        "file": f"photos/{source_id}.jpg",
        "position": position,
        "taken_at": None,
        "created_at": T0,
        **fields,
    }


def pin_record(source_id: str, **fields: Any) -> dict[str, Any]:
    return {
        "source_id": source_id,
        "name": f"name-{source_id}",
        "memo": None,
        "latitude": 35.5,
        "longitude": 139.25,
        "visited": True,
        "archived": False,
        "created_at": T0,
        "updated_at": "2023-01-01T00:00:00.000000Z",
        "tags": [],
        "photos": [],
        **fields,
    }


def write_bundle(
    bundle_dir: Path,
    pins: list[dict[str, Any]],
    images: dict[str, bytes],
    *,
    kind: str = "walkshare",
) -> None:
    """pins の写真の大きさ・sha256 を images から埋めて、README の形のバンドルを書く。"""
    (bundle_dir / "photos").mkdir(parents=True)
    for source_id, data in images.items():
        (bundle_dir / "photos" / f"{source_id}.jpg").write_bytes(data)
    for pin in pins:
        for photo in pin["photos"]:
            data = images[photo["source_id"]]
            photo.setdefault("byte_size", len(data))
            photo.setdefault("width", 64)
            photo.setdefault("height", 48)
            photo.setdefault("sha256", bundle.sha256_hex(data))
    pins_bytes = bundle.encode_json({"pins": pins})
    (bundle_dir / "pins.json").write_bytes(pins_bytes)
    manifest = bundle.build_manifest(
        source={"kind": kind, "map_id": "old-map"},
        pins=pins,
        pins_bytes=pins_bytes,
        exported_at=datetime(2026, 10, 26, tzinfo=UTC),
    )
    (bundle_dir / "manifest.json").write_bytes(bundle.encode_json(manifest))


def sample_bundle(bundle_dir: Path) -> None:
    write_bundle(
        bundle_dir,
        [
            pin_record(
                "s1",
                memo="メモ",
                tags=[
                    {"label": "ミケ", "created_at": T0},
                    {"label": "タマ", "created_at": T0},
                    {"label": "クロ", "created_at": "2022-03-09T00:00:00.000000Z"},
                ],
                photos=[
                    photo_record("p1", 0, taken_at="2022-03-10T00:00:00.000000Z"),
                    photo_record("p2", 1),
                ],
            ),
            pin_record("s2", name=None, visited=False, archived=True),
        ],
        {"p1": make_jpeg((640, 480), orientation=6), "p2": make_jpeg()},
    )


def settings_for_test(**overrides: Any) -> Settings:
    return Settings(_env_file=None, **overrides)


class CountingStorage(FakeObjectStorage):
    """書いたキーを数える FakeObjectStorage。"""

    def __init__(self) -> None:
        super().__init__(secret="test")
        self.puts: list[str] = []

    def put_bytes(self, key: str, data: bytes, *, content_type: str) -> None:
        self.puts.append(key)
        super().put_bytes(key, data, content_type=content_type)


Runner = Callable[..., dict[str, Any]]


@pytest.fixture
def run_import(
    tmp_path: Path,
    session_factory: sessionmaker[Session],
    owner: tuple[uuid.UUID, uuid.UUID],
) -> Runner:
    """tmp_path/bundle を owner の地図に読み込み、報告を返す。"""
    user_id, map_id = owner

    def run(
        *,
        storage: FakeObjectStorage | None = None,
        settings: Settings | None = None,
        yes: bool = True,
        dry_run: bool = False,
        sanpo_map_id: uuid.UUID = map_id,
        as_user: uuid.UUID = user_id,
    ) -> dict[str, Any]:
        importer = ib.prepare_importer(
            bundle_dir=tmp_path / "bundle",
            sanpo_map_id=sanpo_map_id,
            user_id=as_user,
            settings=settings or settings_for_test(),
            session_factory=session_factory,
            storage=storage or CountingStorage(),
        )
        return ib.execute(
            importer,
            target="local",
            bundle_dir=tmp_path / "bundle",
            dry_run=dry_run,
            yes=yes,
            destination={"db_host": "localhost", "storage": "fake"},
        )

    return run


def count_rows(session_factory: sessionmaker[Session]) -> tuple[int, int, int]:
    with session_factory() as db:
        return tuple(  # type: ignore[return-value]
            db.scalar(select(func.count()).select_from(model)) for model in (Pin, PinPhoto, PinTag)
        )


# ---------------------------------------------------------------------------
# 書き込み
# ---------------------------------------------------------------------------


def test_import_writes_rows_like_the_app(
    tmp_path: Path,
    session_factory: sessionmaker[Session],
    owner: tuple[uuid.UUID, uuid.UUID],
    run_import: Runner,
) -> None:
    """ピン・タグ・写真が README のとおりに入り、ID は uuid5、作成者は指定したユーザー、
    散歩との紐付けは null、地図の updated_at が更新されること。
    """
    user_id, map_id = owner
    sample_bundle(tmp_path / "bundle")
    storage = CountingStorage()

    report = run_import(storage=storage)

    assert report["inserted"] == {
        "pins": 2,
        "photos": 2,
        "tags": 3,
        "photo_bytes": report["plan"]["bytes_to_add"],
    }
    pin_id = ib.migration_id("walkshare", map_id, "pin", "s1")
    with session_factory() as db:
        pin = db.get(Pin, pin_id)
        assert pin is not None
        assert (pin.sanpo_map_id, pin.created_by_user_id, pin.client_pin_id) == (
            map_id,
            user_id,
            pin_id,
        )
        assert (pin.name, pin.memo, pin.latitude, pin.longitude) == (
            "name-s1",
            "メモ",
            35.5,
            139.25,
        )
        assert (pin.visited, pin.archived, pin.client_walk_id) == (True, False, None)
        assert pin.created_at == datetime(2022, 3, 9, 1, tzinfo=UTC)
        assert pin.updated_at == datetime(2023, 1, 1, tzinfo=UTC)
        s2 = db.get(Pin, ib.migration_id("walkshare", map_id, "pin", "s2"))
        assert s2 is not None and (s2.name, s2.visited, s2.archived) == (None, False, True)

        photos = db.scalars(
            select(PinPhoto).where(PinPhoto.pin_id == pin_id).order_by(PinPhoto.position)
        ).all()
        upload_id = ib.migration_id("walkshare", map_id, "upload", "p1")
        assert photos[0].id == ib.migration_id("walkshare", map_id, "photo", "p1")
        assert photos[0].upload_id == upload_id
        assert photos[0].s3_key == f"original/pins/{user_id}/{upload_id}.jpg"
        assert photos[0].thumbnail_s3_key == f"thumb/pins/{user_id}/{upload_id}/512.jpg"
        assert photos[0].uploaded_by_user_id == user_id
        assert (photos[0].position, photos[1].position) == (0, 1)
        assert photos[0].taken_at == datetime(2022, 3, 10, tzinfo=UTC)
        assert photos[1].taken_at is None
        assert photos[0].created_at == datetime(2022, 3, 9, 1, tzinfo=UTC)
        # 寸法は原本のヘッダーの値（EXIF の回転を反映する前。アプリの確定処理と同じ）。
        assert (photos[0].width, photos[0].height) == (640, 480)

        sanpo_map = db.get(SanpoMap, map_id)
        assert sanpo_map is not None and sanpo_map.updated_at > datetime(2025, 1, 1, tzinfo=UTC)

    # 原本はメタデータを除いたもの（向きだけの Exif が残る）で、byte_size はその大きさ。
    original = storage.get_bytes(photos[0].s3_key, max_bytes=10 * 1024 * 1024)
    source = (tmp_path / "bundle" / "photos" / "p1.jpg").read_bytes()
    assert original == strip_jpeg_metadata(source)
    assert photos[0].byte_size == len(original)
    with Image.open(io.BytesIO(original)) as image:
        assert dict(image.getexif()) == {_ORIENTATION_TAG: 6}
    thumbnail = storage.get_bytes(photos[0].thumbnail_s3_key, max_bytes=10 * 1024 * 1024)
    with Image.open(io.BytesIO(thumbnail)) as image:
        # サムネイルは向きを反映して縦長になる。
        assert image.size == (photos[0].thumbnail_width, photos[0].thumbnail_height) == (384, 512)


def test_tags_keep_bundle_order_by_bumping_created_at(
    tmp_path: Path,
    session_factory: sessionmaker[Session],
    owner: tuple[uuid.UUID, uuid.UUID],
    run_import: Runner,
) -> None:
    """created_at が同じ・逆順のタグは 1 マイクロ秒ずつ繰り上げ、アプリの並び（created_at, id）が
    バンドルの配列の順になること。
    """
    _, map_id = owner
    sample_bundle(tmp_path / "bundle")

    run_import()

    pin_id = ib.migration_id("walkshare", map_id, "pin", "s1")
    with session_factory() as db:
        tags = db.scalars(
            select(PinTag).where(PinTag.pin_id == pin_id).order_by(PinTag.created_at, PinTag.id)
        ).all()
    base = datetime(2022, 3, 9, 1, tzinfo=UTC)
    assert [(t.label, t.label_key, t.created_at) for t in tags] == [
        ("ミケ", "ミケ", base),
        ("タマ", "タマ", base + timedelta(microseconds=1)),
        ("クロ", "クロ", base + timedelta(microseconds=2)),
    ]
    assert tags[0].id == ib.migration_id("walkshare", map_id, "tag", "s1", "ミケ")


def test_second_import_writes_nothing(
    tmp_path: Path, session_factory: sessionmaker[Session], run_import: Runner
) -> None:
    """同じバンドルを2回読み込んでも件数は変わらず、2回目は DB も S3 も書かないこと。"""
    sample_bundle(tmp_path / "bundle")
    run_import()
    counts = count_rows(session_factory)
    storage = CountingStorage()

    report = run_import(storage=storage)

    assert count_rows(session_factory) == counts == (2, 2, 3)
    assert report["plan"]["pins_to_insert"] == 0
    assert report["plan"]["photos_existing"] == 2
    assert report["inserted"] == {"pins": 0, "photos": 0, "tags": 0, "photo_bytes": 0}
    assert storage.puts == []


def test_same_bundle_to_another_map_gets_other_ids(
    tmp_path: Path,
    session_factory: sessionmaker[Session],
    owner: tuple[uuid.UUID, uuid.UUID],
    run_import: Runner,
) -> None:
    """同じバンドルを別の地図に読み込むと、移行先の地図 ID を名前に含む別の ID で入ること。"""
    user_id, _ = owner
    sample_bundle(tmp_path / "bundle")
    with session_factory() as db:
        other_map, _ = SanpoMapRepository(db).create_with_owner(
            owner_user_id=user_id, name="別の地図", is_default=False
        )
        db.commit()
        other_map_id = other_map.id

    run_import()
    run_import(sanpo_map_id=other_map_id)

    assert count_rows(session_factory) == (4, 4, 6)


def test_without_yes_or_with_dry_run_writes_nothing(
    tmp_path: Path, session_factory: sessionmaker[Session], run_import: Runner
) -> None:
    """--yes が無いとき・--dry-run のときは、件数と容量を出すだけで、
    DB も S3 も対応表も書かないこと。
    """
    sample_bundle(tmp_path / "bundle")
    storage = CountingStorage()

    stopped = run_import(storage=storage, yes=False)
    dry = run_import(storage=storage, dry_run=True)

    assert stopped["result"].startswith("stopped")
    assert dry["result"] == "dry-run"
    assert dry["plan"]["pins_to_insert"] == 2
    assert dry["plan"]["photos_to_insert"] == 2
    assert dry["plan"]["tags_to_insert"] == 3
    assert count_rows(session_factory) == (0, 0, 0)
    assert storage.puts == []
    assert list(tmp_path.glob("*.import-*.json")) == []


def test_mapping_file_lists_new_ids_and_keys(
    tmp_path: Path, owner: tuple[uuid.UUID, uuid.UUID], run_import: Runner
) -> None:
    """書く前に、元の ID → 新しい ID・S3 のキーの対応表をバンドルの横に 0600 で書くこと。"""
    _, map_id = owner
    sample_bundle(tmp_path / "bundle")

    run_import()

    path = tmp_path / f"bundle.import-local-{map_id}.json"
    mapping = json.loads(path.read_text())
    assert path.stat().st_mode & 0o777 == 0o600
    assert mapping["pins"][0]["id"] == str(ib.migration_id("walkshare", map_id, "pin", "s1"))
    assert mapping["pins"][0]["photos"][0]["s3_key"].startswith("original/pins/")


# ---------------------------------------------------------------------------
# 止まる（何も書かない）
# ---------------------------------------------------------------------------


def test_quota_exceeded_stops_without_writing(
    tmp_path: Path, session_factory: sessionmaker[Session], run_import: Runner
) -> None:
    """使用量 + まだ入っていない写真の合計が上限を超えるなら、何も書かずに止まること。"""
    sample_bundle(tmp_path / "bundle")
    storage = CountingStorage()

    with pytest.raises(ib.ImportBundleError, match="容量の上限"):
        run_import(storage=storage, settings=settings_for_test(pin_photo_user_quota_bytes=1000))

    assert count_rows(session_factory) == (0, 0, 0)
    assert storage.puts == []


def test_quota_is_rechecked_per_pin_with_pending_uploads(
    tmp_path: Path,
    session_factory: sessionmaker[Session],
    owner: tuple[uuid.UUID, uuid.UUID],
) -> None:
    """書く前の確認の後にアプリで写真の枠（pending）が増えて上限を超えるなら、そのピンを書く前に
    止まり、そのピンの行も S3 のオブジェクトも残さないこと（ピンごとにロックの中で確かめ直す）。
    """
    user_id, map_id = owner
    sample_bundle(tmp_path / "bundle")
    storage = CountingStorage()
    probe = ib.prepare_importer(
        bundle_dir=tmp_path / "bundle",
        sanpo_map_id=map_id,
        user_id=user_id,
        settings=settings_for_test(),
        session_factory=session_factory,
        storage=storage,
    )
    needed = probe.plan().bytes_to_add
    importer = ib.prepare_importer(
        bundle_dir=tmp_path / "bundle",
        sanpo_map_id=map_id,
        user_id=user_id,
        settings=settings_for_test(pin_photo_user_quota_bytes=needed + 100),
        session_factory=session_factory,
        storage=storage,
    )
    importer.plan()
    with session_factory() as db:
        upload_id = uuid.uuid4()
        db.add(
            PinPhotoUpload(
                id=upload_id,
                user_id=user_id,
                s3_key=f"staging/pins/{user_id}/{upload_id}.jpg",
                content_type="image/jpeg",
                declared_byte_size=1000,
                expires_at=datetime.now(UTC) + timedelta(hours=1),
            )
        )
        db.commit()

    with pytest.raises(ib.ImportBundleError, match="書いている途中"):
        importer.write()

    assert importer.position == "ピン 0"
    assert count_rows(session_factory) == (0, 0, 0)
    assert storage.puts == []


@pytest.mark.parametrize(
    "tamper",
    [
        "photo-bytes",
        "pins-json",
        "format-version",
        "unnormalized-tag",
        "duplicate-tag",
        "file-name",
        "symlink",
        "position",
        "untrimmed-name",
        "colon-in-pin-id",
    ],
)
def test_invalid_bundle_stops_without_writing(
    tamper: str, tmp_path: Path, session_factory: sessionmaker[Session], run_import: Runner
) -> None:
    """sha256・format_version・タグの正規化・file の形・symlink・連番などが外れたら、
    何も書かずに止まり、
    文言にタグや名前の値を含まないこと。
    """
    bundle_dir = tmp_path / "bundle"
    pins = [
        pin_record("s0"),
        pin_record(
            "s1",
            tags=[{"label": "秘密のタグ", "created_at": T0}],
            photos=[photo_record("p1", 0)],
        ),
    ]
    images = {"p1": make_jpeg()}
    if tamper == "unnormalized-tag":
        pins[1]["tags"] = [{"label": "#秘密のタグ", "created_at": T0}]
    if tamper == "duplicate-tag":
        pins[1]["tags"] = [{"label": "秘密", "created_at": T0}, {"label": "秘密", "created_at": T0}]
    if tamper == "file-name":
        pins[1]["photos"][0]["file"] = "photos/../p1.jpg"
    if tamper == "position":
        pins[1]["photos"][0]["position"] = 1
    if tamper == "untrimmed-name":
        pins[1]["name"] = " 秘密の場所 "
    if tamper == "colon-in-pin-id":
        pins[1]["source_id"] = "s1:tag"
    write_bundle(bundle_dir, pins, images)
    if tamper == "photo-bytes":
        (bundle_dir / "photos" / "p1.jpg").write_bytes(make_jpeg((65, 48)))
    if tamper == "pins-json":
        (bundle_dir / "pins.json").write_bytes((bundle_dir / "pins.json").read_bytes() + b" ")
    if tamper == "format-version":
        manifest = json.loads((bundle_dir / "manifest.json").read_text())
        (bundle_dir / "manifest.json").write_text(json.dumps({**manifest, "format_version": 2}))
    if tamper == "symlink":
        real = tmp_path / "elsewhere.jpg"
        (bundle_dir / "photos" / "p1.jpg").rename(real)
        (bundle_dir / "photos" / "p1.jpg").symlink_to(real)

    with pytest.raises(ib.ImportBundleError) as exc_info:
        run_import()

    message = str(exc_info.value)
    for value in ("秘密", "s1", "p1", "name-"):
        assert value not in message
    assert count_rows(session_factory) == (0, 0, 0)


def test_not_owner_or_missing_map_stops(
    tmp_path: Path,
    session_factory: sessionmaker[Session],
    owner: tuple[uuid.UUID, uuid.UUID],
    run_import: Runner,
) -> None:
    """指定したユーザーが移行先の地図の owner でない・地図が無いときは、何も書かずに止まること。"""
    sample_bundle(tmp_path / "bundle")
    with session_factory() as db:
        other_user = make_user(db, "someone-else")

    with pytest.raises(ib.ImportBundleError, match="owner"):
        run_import(as_user=other_user)
    with pytest.raises(ib.ImportBundleError, match="地図がありません"):
        run_import(sanpo_map_id=uuid.uuid4())

    assert count_rows(session_factory) == (0, 0, 0)


def test_shared_map_stops(
    tmp_path: Path,
    session_factory: sessionmaker[Session],
    owner: tuple[uuid.UUID, uuid.UUID],
    run_import: Runner,
) -> None:
    """owner 以外のメンバーがいる地図には、移したピン・写真がほかの人に見えるので、
    書かずに止まること。
    """
    _, map_id = owner
    sample_bundle(tmp_path / "bundle")
    with session_factory() as db:
        member = make_user(db, "member")
        db.add(SanpoMapMember(sanpo_map_id=map_id, user_id=member, role="editor"))
        db.commit()

    with pytest.raises(ib.ImportBundleError, match="メンバー"):
        run_import()

    assert count_rows(session_factory) == (0, 0, 0)


def test_db_error_is_reported_without_detail(
    tmp_path: Path,
    session_factory: sessionmaker[Session],
    owner: tuple[uuid.UUID, uuid.UUID],
) -> None:
    """制約違反は型・SQLSTATE・制約名と、どのピンで止まったかだけを出し、
    DETAIL（ユーザー ID など）を出さないこと。
    """
    user_id, map_id = owner
    sample_bundle(tmp_path / "bundle")
    pin_id = ib.migration_id("walkshare", map_id, "pin", "s1")
    with session_factory() as db:
        # 別の ID で、同じ (created_by_user_id, client_pin_id) のピンを先に入れておく。
        db.add(
            Pin(
                sanpo_map_id=map_id,
                created_by_user_id=user_id,
                client_pin_id=pin_id,
                latitude=0.0,
                longitude=0.0,
            )
        )
        db.commit()
    importer = ib.prepare_importer(
        bundle_dir=tmp_path / "bundle",
        sanpo_map_id=map_id,
        user_id=user_id,
        settings=settings_for_test(),
        session_factory=session_factory,
        storage=CountingStorage(),
    )

    with pytest.raises(Exception) as exc_info:
        ib.execute(
            importer,
            target="local",
            bundle_dir=tmp_path / "bundle",
            dry_run=False,
            yes=True,
            destination={},
        )

    message = ib.describe_error(exc_info.value)
    assert message == (
        "IntegrityError sqlstate=23505 constraint=uq_pins_created_by_user_id_client_pin_id"
    )
    assert importer.position == "ピン 0"
    assert str(user_id) not in message


# ---------------------------------------------------------------------------
# 接続先
# ---------------------------------------------------------------------------


class FakeSsm:
    def __init__(self, value: str) -> None:
        self.value = value
        self.names: list[str] = []

    def get_parameter(self, *, Name: str) -> dict[str, Any]:  # noqa: N803 - boto3 の引数名
        self.names.append(Name)
        return {"Parameter": {"Value": self.value}}


class FakeSts:
    def __init__(self, account: str) -> None:
        self.account = account

    def get_caller_identity(self) -> dict[str, str]:
        return {"Account": self.account}


def test_verify_remote_target_checks_db_host_bucket_and_account() -> None:
    """DB のホスト名は --db-host と、バケット名は --target の SSM の値と、資格情報のアカウントは
    --aws-account-id と一致しなければ止まること。
    """
    settings = settings_for_test(
        pin_photo_bucket_name="bucket-dev", database_dsn="postgresql://u:pw@db-dev.example/app"
    )
    ssm = FakeSsm("bucket-dev")

    def verify(**overrides: Any) -> None:
        kwargs: dict[str, Any] = {
            "expected_account_id": "111",
            "expected_db_host": "db-dev.example",
            "ssm": ssm,
            "sts": FakeSts("111"),
            **overrides,
        }
        ib.verify_remote_target(kwargs.pop("target", "dev"), settings, **kwargs)

    verify()
    assert ssm.names == ["/sanposcape/dev/platform/pin_photos/bucket_name"]
    with pytest.raises(ib.ImportBundleError, match="--db-host"):
        verify(expected_db_host="db-prod.example")
    sneaky = settings_for_test(
        pin_photo_bucket_name="bucket-dev",
        database_dsn="postgresql://u:pw@db-dev.example/app?host=db-prod.example",
    )
    with pytest.raises(ib.ImportBundleError, match="host・hostaddr"):
        ib.verify_remote_target(
            "dev",
            sneaky,
            expected_account_id="111",
            expected_db_host="db-dev.example",
            ssm=ssm,
            sts=FakeSts("111"),
        )
    with pytest.raises(ib.ImportBundleError, match="PIN_PHOTO_BUCKET_NAME"):
        verify(target="prod", ssm=FakeSsm("bucket-prod"))
    with pytest.raises(ib.ImportBundleError, match="アカウント"):
        verify(expected_account_id="222")


def test_build_settings_for_remote_target_ignores_dotenv(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """dev・prod では .env を読まず、DSN・バケットが環境変数に無ければ止まること。"""
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".env").write_text(
        "DATABASE_DSN=postgresql://from-dotenv/db\nPIN_PHOTO_BUCKET_NAME=from-dotenv\n"
    )
    for name in ("DATABASE_DSN", "PIN_PHOTO_BUCKET_NAME", "STORAGE_MODE"):
        monkeypatch.delenv(name, raising=False)

    with pytest.raises(ib.ImportBundleError, match="DATABASE_DSN, PIN_PHOTO_BUCKET_NAME"):
        ib.build_settings("prod")

    monkeypatch.setenv("DATABASE_DSN", "postgresql://user:pw@neon.example/db")
    monkeypatch.setenv("PIN_PHOTO_BUCKET_NAME", "bucket-prod")
    monkeypatch.setenv("STORAGE_MODE", "fake")
    with pytest.raises(ib.ImportBundleError, match="STORAGE_MODE=real"):
        ib.build_settings("prod")
    monkeypatch.setenv("STORAGE_MODE", "real")
    assert ib.build_settings("prod").pin_photo_bucket_name == "bucket-prod"
    monkeypatch.setenv("AWS_ENDPOINT_URL_S3", "http://localhost:4566")
    with pytest.raises(ib.ImportBundleError, match="AWS_ENDPOINT_URL_S3"):
        ib.build_settings("prod")


def test_build_settings_for_local_requires_fake_storage_and_local_db(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """local では .env を読み、DB はホストから届く localhost、写真は fake のディスクにだけ
    書くこと。
    """
    monkeypatch.chdir(tmp_path)
    for name in ("DB_HOST", "DATABASE_DSN", "STORAGE_MODE", "DEV_STORAGE_DIR", "ENV"):
        monkeypatch.delenv(name, raising=False)
    (tmp_path / ".env").write_text("STORAGE_MODE=fake\nDEV_STORAGE_DIR=storages/dev-storage\n")

    settings = ib.build_settings("local")
    assert settings.db_host == "localhost"
    storage, name = ib.build_storage("local", settings)
    assert isinstance(storage, FakeObjectStorage)
    assert name == f"fake:{ib.BACKEND_ROOT / 'storages' / 'dev-storage'}"

    (tmp_path / ".env").write_text("STORAGE_MODE=real\nPIN_PHOTO_BUCKET_NAME=bucket-dev\n")
    with pytest.raises(ib.ImportBundleError, match="STORAGE_MODE=fake"):
        ib.build_settings("local")
    monkeypatch.setenv("STORAGE_MODE", "fake")
    monkeypatch.setenv("DEV_STORAGE_DIR", "x")
    monkeypatch.setenv("DATABASE_DSN", "postgresql://user:pw@neon.example/db")
    with pytest.raises(ib.ImportBundleError, match="DATABASE_DSN"):
        ib.build_settings("local")


# ---------------------------------------------------------------------------
# 入口（出力）
# ---------------------------------------------------------------------------


@pytest.fixture
def main_args(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    session_factory: sessionmaker[Session],
    owner: tuple[uuid.UUID, uuid.UUID],
) -> Generator[list[str], None, None]:
    """作業ディレクトリ・接続先をテスト用に差し替えて main() に渡す引数（local・--yes）。"""
    user_id, map_id = owner
    work_dir = tmp_path / "walkshare-migration"
    sample_bundle(work_dir / "bundle")
    monkeypatch.setattr(bundle, "WORK_DIR", work_dir)
    # engine の fixture と同じテスト用 DB に繋ぐ。接続先はすべて明示する。
    test_db = settings_for_test(
        database_dsn="",
        db_host=_AMBIENT.db_host,
        db_port=_AMBIENT.db_port,
        db_user=_AMBIENT.db_user,
        db_password=_AMBIENT.db_password,
        db_name=_AMBIENT.test_db_name,
    )
    monkeypatch.setattr(ib, "build_settings", lambda target: test_db)
    monkeypatch.setattr(ib, "build_storage", lambda target, settings: (CountingStorage(), "fake"))
    # main() は sanposcape のロガーを ERROR に上げるので、ほかのテストのログに響かないよう戻す。
    app_logger = logging.getLogger("sanposcape")
    saved_level = app_logger.level
    yield [
        "--target",
        "local",
        "--bundle",
        str(work_dir / "bundle"),
        "--map-id",
        str(map_id),
        "--user-id",
        str(user_id),
        "--yes",
    ]
    app_logger.setLevel(saved_level)


def test_main_prints_counts_without_personal_data(
    main_args: list[str],
    owner: tuple[uuid.UUID, uuid.UUID],
    capsys: pytest.CaptureFixture[str],
) -> None:
    """標準出力は件数・容量と接続先だけで、ユーザー ID・地図 ID・名前・メモ・タグ・
    旧アプリの ID を出さないこと。
    """
    assert ib.main(main_args) == 0

    captured = capsys.readouterr()
    assert json.loads(captured.out)["inserted"]["pins"] == 2
    user_id, map_id = owner
    for value in (str(user_id), str(map_id), "name-s1", "メモ", "ミケ", "s1", "p1", "old-map"):
        assert value not in captured.out + captured.err


def test_main_prints_only_exception_type_and_position(
    main_args: list[str], monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """想定外の例外は、文言（値が入りうる）を出さずに、型とどこで止まったかだけを標準エラーに出すこと。"""

    def failing_put(self: CountingStorage, key: str, data: bytes, *, content_type: str) -> None:
        raise ValueError(f"秘密のタグ {key}")

    monkeypatch.setattr(CountingStorage, "put_bytes", failing_put)

    assert ib.main(main_args) == 1

    captured = capsys.readouterr()
    assert captured.err == "error（ピン 0 の写真 0）: ValueError\n"
    assert "秘密" not in captured.out

"""export_sanposcape.py のテスト。

テスト用 DB と FakeObjectStorage に手で作った地図を書き出し、import_bundle.py で別の地図に読み込む。
"""

import io
import json
import logging
import uuid
from collections.abc import Generator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import bundle
import export_sanposcape as ex
import import_bundle as ib
import pytest
from PIL import Image
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import Session, sessionmaker

from sanposcape.config import Settings
from sanposcape.integrations.aws.s3 import FakeObjectStorage
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.models import Pin, PinPhoto, PinTag
from sanposcape.sanpo_maps.photos.jpeg_metadata import strip_jpeg_metadata
from sanposcape.sanpo_maps.photos.photo_keys import original_key
from sanposcape.users.models import User

T0 = datetime(2024, 5, 1, 9, 0, tzinfo=UTC)
_ORIENTATION_TAG = 0x0112


# ---------------------------------------------------------------------------
# 元の地図（DB の fixture は tests/conftest.py）
# ---------------------------------------------------------------------------


class GetOnlyStorage:
    """`get_bytes` だけを持つストレージ。書き出しがほかの操作（書き込み・削除）を呼ぶと
    AttributeError で落ちる。
    """

    def __init__(self, storage: FakeObjectStorage) -> None:
        self._storage = storage

    def get_bytes(self, key: str, *, max_bytes: int) -> bytes:
        return self._storage.get_bytes(key, max_bytes=max_bytes)


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


def make_map(db: Session, user_id: uuid.UUID, name: str) -> uuid.UUID:
    sanpo_map, _ = SanpoMapRepository(db).create_with_owner(
        owner_user_id=user_id, name=name, is_default=False
    )
    db.commit()
    return sanpo_map.id


def stored_jpeg(size: tuple[int, int] = (64, 48), *, orientation: int | None = None) -> bytes:
    """アプリが S3 に置く原本（確定処理でメタデータを除いた後。向きの Exif だけが残る）。"""
    kwargs: dict[str, Any] = {"format": "JPEG", "quality": 90}
    if orientation is not None:
        exif = Image.Exif()
        exif[_ORIENTATION_TAG] = orientation
        kwargs["exif"] = exif.tobytes()
    out = io.BytesIO()
    Image.new("RGB", size, (200, 80, 10)).save(out, **kwargs)
    return strip_jpeg_metadata(out.getvalue())


def add_pin(
    db: Session,
    *,
    map_id: uuid.UUID,
    user_id: uuid.UUID,
    created_at: datetime,
    tags: list[tuple[str, datetime]] | None = None,
    photos: list[tuple[int, bytes, datetime | None]] | None = None,
    storage: FakeObjectStorage | None = None,
    **fields: Any,
) -> uuid.UUID:
    """アプリが作るのと同じ形のピン・タグ・写真を入れる。写真は (position, 原本, taken_at)。"""
    pin = Pin(
        sanpo_map_id=map_id,
        created_by_user_id=user_id,
        client_pin_id=uuid.uuid4(),
        latitude=35.5,
        longitude=139.25,
        created_at=created_at,
        updated_at=created_at + timedelta(days=1),
        **fields,
    )
    db.add(pin)
    db.flush()
    for label, tag_created_at in tags or []:
        db.add(
            PinTag(
                pin_id=pin.id,
                label=label,
                label_key=label.lower(),
                created_by_user_id=user_id,
                created_at=tag_created_at,
            )
        )
    for position, data, taken_at in photos or []:
        assert storage is not None
        upload_id = uuid.uuid4()
        key = original_key(user_id=user_id, upload_id=upload_id)
        storage.put_bytes(key, data, content_type="image/jpeg")
        with Image.open(io.BytesIO(data)) as image:
            width, height = image.size
        db.add(
            PinPhoto(
                pin_id=pin.id,
                uploaded_by_user_id=user_id,
                upload_id=upload_id,
                s3_key=key,
                content_type="image/jpeg",
                byte_size=len(data),
                width=width,
                height=height,
                position=position,
                taken_at=taken_at,
                created_at=created_at + timedelta(hours=position),
            )
        )
    db.commit()
    return pin.id


@pytest.fixture
def storage() -> FakeObjectStorage:
    return FakeObjectStorage(secret="test")


@pytest.fixture
def source_map(
    session_factory: sessionmaker[Session], storage: FakeObjectStorage
) -> tuple[uuid.UUID, uuid.UUID]:
    """(ユーザー ID, 元の地図 ID)。

    タグの created_at の同値・写真の position の隙間・null を含む。
    """
    with session_factory() as db:
        user_id = make_user(db, "source-owner")
        map_id = make_map(db, user_id, "元の地図")
        add_pin(
            db,
            map_id=map_id,
            user_id=user_id,
            created_at=T0,
            name="公園",
            memo="ベンチがある",
            visited=True,
            # アプリで1回の保存で付けたタグは created_at が同じになり、id の順に並ぶ。
            tags=[("ミケ", T0), ("タマ", T0), ("クロ", T0 - timedelta(minutes=1))],
            # 写真を消すと position に隙間ができる。
            photos=[
                (0, stored_jpeg((640, 480), orientation=6), T0 - timedelta(days=3)),
                (2, stored_jpeg(), None),
            ],
            storage=storage,
        )
        add_pin(
            db,
            map_id=map_id,
            user_id=user_id,
            created_at=T0 + timedelta(minutes=5),
            name=None,
            archived=True,
        )
    return user_id, map_id


@pytest.fixture
def read_only_factory(test_db_settings: Settings) -> Generator[sessionmaker[Session], None, None]:
    """書き出しの入口と同じ作り方の、テスト用 DB への読み取り専用の接続。"""
    engine = ex.create_read_only_engine(
        test_db_settings.database_url, test_db_settings.sqlalchemy_engine_kwargs
    )
    yield sessionmaker(bind=engine)
    engine.dispose()


def export(
    session_factory: sessionmaker[Session],
    storage: FakeObjectStorage,
    map_id: uuid.UUID,
    out_dir: Path,
    *,
    created_by: uuid.UUID | None = None,
) -> dict[str, Any]:
    return ex.run(
        target="local",
        sanpo_map_id=map_id,
        created_by=created_by,
        out_dir=out_dir,
        session_factory=session_factory,
        storage=GetOnlyStorage(storage),  # type: ignore[arg-type]
        max_bytes=10 * 1024 * 1024,
        now=lambda: datetime(2026, 10, 27, tzinfo=UTC),
    )


def map_view(
    session_factory: sessionmaker[Session], storage: FakeObjectStorage, map_id: uuid.UUID
) -> list[tuple[Any, ...]]:
    """地図の見え方（アプリの並び順のピン・タグ・写真の原本）。

    ID・作成者・タグの created_at は除く。
    """
    view = []
    with session_factory() as db:
        pins = db.scalars(
            select(Pin).where(Pin.sanpo_map_id == map_id).order_by(Pin.created_at, Pin.id)
        ).all()
        for pin in pins:
            tags = db.scalars(
                select(PinTag.label)
                .where(PinTag.pin_id == pin.id)
                .order_by(PinTag.created_at, PinTag.id)
            ).all()
            photos = db.scalars(
                select(PinPhoto)
                .where(PinPhoto.pin_id == pin.id)
                .order_by(PinPhoto.position, PinPhoto.id)
            ).all()
            view.append(
                (
                    pin.name,
                    pin.memo,
                    pin.latitude,
                    pin.longitude,
                    pin.visited,
                    pin.archived,
                    pin.created_at,
                    pin.updated_at,
                    pin.client_walk_id,
                    list(tags),
                    [
                        (
                            storage.get_bytes(photo.s3_key, max_bytes=10 * 1024 * 1024),
                            photo.byte_size,
                            photo.width,
                            photo.height,
                            photo.taken_at,
                            photo.created_at,
                        )
                        for photo in photos
                    ],
                )
            )
    return view


# ---------------------------------------------------------------------------
# 往復
# ---------------------------------------------------------------------------


def test_round_trip_to_another_map_looks_the_same(
    tmp_path: Path,
    session_factory: sessionmaker[Session],
    storage: FakeObjectStorage,
    source_map: tuple[uuid.UUID, uuid.UUID],
    read_only_factory: sessionmaker[Session],
) -> None:
    """local の地図を読み取り専用の接続で書き出し、読み込みで別のユーザーの別の地図に写すと、
    ピン・タグの並び・写真の並びと原本が元の地図と同じになること。
    """
    _, source_map_id = source_map
    with session_factory() as db:
        target_user_id = make_user(db, "target-owner")
        target_map_id = make_map(db, target_user_id, "移行先")
    bundle_dir = tmp_path / "bundle"

    report = export(read_only_factory, storage, source_map_id, bundle_dir)
    importer = ib.prepare_importer(
        bundle_dir=bundle_dir,
        sanpo_map_id=target_map_id,
        user_id=target_user_id,
        settings=Settings(_env_file=None),
        session_factory=session_factory,
        storage=storage,
    )
    imported = ib.execute(
        importer,
        target="local",
        bundle_dir=bundle_dir,
        dry_run=False,
        yes=True,
        destination={},
    )

    assert report["counts"] == {"pins": 2, "photos": 2, "tags": 3}
    assert imported["inserted"]["pins"] == 2
    source_view = map_view(session_factory, storage, source_map_id)
    assert map_view(session_factory, storage, target_map_id) == source_view
    # 並び・null・アーカイブを確かめられるデータになっていること。
    assert [row[0] for row in source_view] == ["公園", None]
    assert source_view[1][5] is True
    assert [photo[4] for photo in source_view[0][10]] == [T0 - timedelta(days=3), None]


def test_bundle_has_readme_shape(
    tmp_path: Path,
    session_factory: sessionmaker[Session],
    read_only_factory: sessionmaker[Session],
    storage: FakeObjectStorage,
    source_map: tuple[uuid.UUID, uuid.UUID],
) -> None:
    """manifest の source は sanposcape・環境・元の地図 ID、写真の position は 0 からの連番に
    振り直し、原本はそのまま（再圧縮しない）、ファイルは 0600 で書くこと。
    """
    _, map_id = source_map
    bundle_dir = tmp_path / "bundle"

    export(read_only_factory, storage, map_id, bundle_dir)

    manifest = json.loads((bundle_dir / "manifest.json").read_text())
    assert manifest["source"] == {
        "kind": "sanposcape",
        "environment": "local",
        "map_id": str(map_id),
    }
    pins = json.loads((bundle_dir / "pins.json").read_text())["pins"]
    photos = pins[0]["photos"]
    assert [photo["position"] for photo in photos] == [0, 1]
    with session_factory() as db:
        keys = db.scalars(select(PinPhoto.s3_key).order_by(PinPhoto.position)).all()
    for photo, key in zip(photos, keys, strict=True):
        data = (bundle_dir / photo["file"]).read_bytes()
        assert data == storage.get_bytes(key, max_bytes=10 * 1024 * 1024)
        assert (photo["byte_size"], photo["sha256"]) == (len(data), bundle.sha256_hex(data))
        assert (bundle_dir / photo["file"]).stat().st_mode & 0o777 == 0o600
    assert (photos[0]["width"], photos[0]["height"]) == (640, 480)
    # タグは表示と同じ (created_at, id) の順（同じ created_at のミケ・タマは id の順）。
    with session_factory() as db:
        shown = db.scalars(select(PinTag.label).order_by(PinTag.created_at, PinTag.id)).all()
    assert [tag["label"] for tag in pins[0]["tags"]] == list(shown)
    assert shown[0] == "クロ"


def test_re_export_removes_photos_no_longer_on_the_map(
    tmp_path: Path,
    session_factory: sessionmaker[Session],
    read_only_factory: sessionmaker[Session],
    storage: FakeObjectStorage,
    source_map: tuple[uuid.UUID, uuid.UUID],
) -> None:
    """書き出し直すと、前の書き出しの後で地図から消えた写真のファイルを消すこと。"""
    _, map_id = source_map
    bundle_dir = tmp_path / "bundle"
    export(read_only_factory, storage, map_id, bundle_dir)
    with session_factory() as db:
        db.delete(db.scalars(select(PinPhoto).where(PinPhoto.position == 2)).one())
        db.commit()

    report = export(read_only_factory, storage, map_id, bundle_dir)

    assert report["stale_files_removed"] == 1
    assert len(list((bundle_dir / "photos").iterdir())) == report["counts"]["photos"] == 1


def test_out_dir_with_other_contents_is_left_untouched(
    tmp_path: Path,
    read_only_factory: sessionmaker[Session],
    storage: FakeObjectStorage,
    source_map: tuple[uuid.UUID, uuid.UUID],
    session_factory: sessionmaker[Session],
) -> None:
    """書き出し先が空でなく、同じ地図の前の書き出しでもない（別のバンドル・別の地図の書き出し）
    ときは、何も消さずに止まること。
    """
    user_id, map_id = source_map
    other = tmp_path / "bundle-walkshare"
    (other / "photos").mkdir(parents=True)
    (other / "manifest.json").write_text("{}")
    (other / "photos" / "keep.jpg").write_bytes(b"x")
    with session_factory() as db:
        another_map_id = make_map(db, user_id, "別の地図")
    export(read_only_factory, storage, another_map_id, tmp_path / "another")

    for out_dir in (other, tmp_path / "another"):
        with pytest.raises(ex.ExportError, match="空ではなく"):
            export(read_only_factory, storage, map_id, out_dir)

    assert (other / "manifest.json").exists()
    assert (other / "photos" / "keep.jpg").exists()
    assert (tmp_path / "another" / "manifest.json").exists()


# ---------------------------------------------------------------------------
# 読み取りだけ
# ---------------------------------------------------------------------------


def test_read_only_engine_rejects_writes(read_only_factory: sessionmaker[Session]) -> None:
    """書き出しの engine の接続は、既定のトランザクションが読み取り専用で書けないこと。"""
    with read_only_factory() as db:
        assert db.scalar(text("SHOW transaction_read_only")) == "on"
        assert db.scalar(text("SHOW transaction_isolation")) == "repeatable read"
        with pytest.raises(DBAPIError) as exc_info:
            db.execute(text("CREATE TEMPORARY TABLE t (x int)"))
    assert exc_info.value.orig.sqlstate == "25006"  # read_only_sql_transaction


def test_read_map_stops_on_writable_connection(
    session_factory: sessionmaker[Session], source_map: tuple[uuid.UUID, uuid.UUID]
) -> None:
    """読み取り専用になっていない接続（pooler が options を落とすなど）では読まずに止まること。"""
    _, map_id = source_map

    with pytest.raises(ex.ExportError, match="読み取り専用"):
        ex.read_map(session_factory, map_id)


def test_dsn_with_options_is_rejected() -> None:
    """DSN の options を接続の引数で黙って上書きしないこと。"""
    with pytest.raises(ex.ExportError, match="options"):
        ex.create_read_only_engine(
            "postgresql+psycopg://u:pw@db.example/app?options=-c%20search_path%3Dx", {}
        )


# ---------------------------------------------------------------------------
# 作成者・想定外のデータ
# ---------------------------------------------------------------------------


def test_multiple_creators_warn_and_created_by_filters(
    tmp_path: Path,
    session_factory: sessionmaker[Session],
    read_only_factory: sessionmaker[Session],
    storage: FakeObjectStorage,
    source_map: tuple[uuid.UUID, uuid.UUID],
) -> None:
    """地図に2人以上のピンがあれば作成者ごとの件数と警告を出し、--created-by でその人の
    ピンだけを書き出すこと（件数は地図全体のまま）。指定したユーザーのピンが無ければ止まること。
    """
    owner_id, map_id = source_map
    with session_factory() as db:
        member_id = make_user(db, "member")
        add_pin(db, map_id=map_id, user_id=member_id, created_at=T0 + timedelta(hours=1))

    everyone = export(read_only_factory, storage, map_id, tmp_path / "all")
    only_owner = export(read_only_factory, storage, map_id, tmp_path / "owner", created_by=owner_id)

    assert everyone["creator_pin_counts"] == [2, 1]
    assert everyone["counts"]["pins"] == 3
    assert "warning" in everyone
    assert only_owner["creator_pin_counts"] == [2, 1]
    assert only_owner["counts"]["pins"] == 2
    assert only_owner["filtered_by_creator"] is True
    assert "warning" not in only_owner
    with pytest.raises(ex.ExportError, match="--created-by"):
        export(read_only_factory, storage, map_id, tmp_path / "nobody", created_by=uuid.uuid4())


@pytest.mark.parametrize("name", [" 公園", ""])
def test_unnormalized_name_stops_without_manifest(
    tmp_path: Path,
    session_factory: sessionmaker[Session],
    read_only_factory: sessionmaker[Session],
    storage: FakeObjectStorage,
    source_map: tuple[uuid.UUID, uuid.UUID],
    name: str,
) -> None:
    """名前が正規化した形でないピンは、直さずにピンの連番だけを出して止まり、
    manifest を書かないこと。
    """
    _, map_id = source_map
    with session_factory() as db:
        db.execute(text("UPDATE pins SET name = :name WHERE name IS NULL"), {"name": name})
        db.commit()

    with pytest.raises(ex.ExportError) as exc_info:
        export(read_only_factory, storage, map_id, tmp_path / "bundle")

    assert (
        str(exc_info.value)
        == "ピン 1: 名前が正規化した形（前後の空白なし・空なら null）ではありません"
    )
    assert not (tmp_path / "bundle" / "manifest.json").exists()


def test_missing_or_resized_original_stops_with_position_only(
    tmp_path: Path,
    session_factory: sessionmaker[Session],
    read_only_factory: sessionmaker[Session],
    storage: FakeObjectStorage,
    source_map: tuple[uuid.UUID, uuid.UUID],
) -> None:
    """S3 に原本が無い・大きさが pin_photos と違うときは、S3 のキー（ユーザー ID が入る）を
    出さずに、ピンと写真の連番だけを出して止まること。
    """
    user_id, map_id = source_map
    with session_factory() as db:
        first, second = db.scalars(select(PinPhoto).order_by(PinPhoto.position)).all()
    storage.put_bytes(second.s3_key, b"short", content_type="image/jpeg")

    with pytest.raises(ex.ExportError) as resized:
        export(read_only_factory, storage, map_id, tmp_path / "bundle")
    storage.delete(first.s3_key)
    with pytest.raises(ex.ExportError) as missing:
        export(read_only_factory, storage, map_id, tmp_path / "bundle")

    assert str(resized.value) == "ピン 0 の写真 1: 大きさが pin_photos.byte_size と違います"
    assert str(missing.value) == "ピン 0 の写真 0: ObjectNotFoundError"
    assert str(user_id) not in str(missing.value)


def test_missing_map_stops(
    tmp_path: Path, read_only_factory: sessionmaker[Session], storage: FakeObjectStorage
) -> None:
    with pytest.raises(ex.ExportError, match="地図がありません"):
        export(read_only_factory, storage, uuid.uuid4(), tmp_path / "bundle")


# ---------------------------------------------------------------------------
# 入口（出力）
# ---------------------------------------------------------------------------


@pytest.fixture
def main_env(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    storage: FakeObjectStorage,
    test_db_settings: Settings,
) -> Generator[Path, None, None]:
    """作業ディレクトリ・接続先をテスト用に差し替え、作業ディレクトリを返す。"""
    work_dir = tmp_path / "walkshare-migration"
    monkeypatch.setattr(bundle, "WORK_DIR", work_dir)
    monkeypatch.setattr(ib, "build_settings", lambda target: test_db_settings)
    monkeypatch.setattr(ib, "build_storage", lambda target, settings: (storage, "fake"))
    # main() は sanposcape のロガーを ERROR に上げるので、ほかのテストのログに響かないよう戻す。
    app_logger = logging.getLogger("sanposcape")
    saved_level = app_logger.level
    yield work_dir
    app_logger.setLevel(saved_level)


def test_main_prints_counts_without_personal_data(
    main_env: Path,
    source_map: tuple[uuid.UUID, uuid.UUID],
    capsys: pytest.CaptureFixture[str],
) -> None:
    """既定の置き場所に書き、標準出力は件数・容量と接続先だけで、ユーザー ID・名前・メモ・
    タグ・ピンや写真の ID を出さないこと。
    """
    user_id, map_id = source_map

    assert ex.main(["--target", "local", "--map-id", str(map_id)]) == 0

    captured = capsys.readouterr()
    assert json.loads(captured.out)["counts"]["pins"] == 2
    assert (main_env / f"bundle-local-{map_id}" / "manifest.json").exists()
    pins = json.loads((main_env / f"bundle-local-{map_id}" / "pins.json").read_text())["pins"]
    for value in (str(user_id), "公園", "ベンチ", "ミケ", pins[0]["source_id"]):
        assert value not in captured.out + captured.err


def test_main_refuses_prod_and_out_outside_work_dir(
    main_env: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    """prod からは書き出さず、置き場所が作業ディレクトリの外なら止まること。"""
    map_id = str(uuid.uuid4())
    with pytest.raises(SystemExit):
        ex.main(["--target", "prod", "--map-id", map_id])

    assert ex.main(["--target", "local", "--map-id", map_id, "--out", str(tmp_path / "x")]) == 1
    assert "置き場所は" in capsys.readouterr().err

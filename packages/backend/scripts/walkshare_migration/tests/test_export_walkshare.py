"""export_walkshare.py のテスト（手で作ったダンプと画像を使い、GCS は関数で差し替える）。"""

import io
import json
import stat
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import bundle
import export_walkshare as ex
import pytest
from PIL import Image, ImageCms

from sanposcape.sanpo_maps.photos.jpeg_metadata import strip_jpeg_metadata

OWNER = "owner-uid"
MAP_PATH = "maps/m1"
EXPORTED_AT = datetime(2026, 10, 26, tzinfo=UTC)
_ORIENTATION_TAG = 0x0112


def make_jpeg(
    size: tuple[int, int] = (64, 48),
    *,
    mode: str = "RGB",
    orientation: int | None = None,
    icc_profile: bytes | None = None,
    noise: bool = False,
) -> bytes:
    if noise:
        image = Image.merge("RGB", [Image.effect_noise(size, 64) for _ in range(3)])
    else:
        image = Image.new("RGB", size, (200, 30, 30))
    if mode != "RGB":
        image = image.convert(mode)
    kwargs: dict[str, Any] = {"format": "JPEG", "quality": 95}
    if orientation is not None:
        exif = Image.Exif()
        exif[_ORIENTATION_TAG] = orientation
        kwargs["exif"] = exif.tobytes()
    if icc_profile is not None:
        kwargs["icc_profile"] = icc_profile
    out = io.BytesIO()
    image.save(out, **kwargs)
    return out.getvalue()


def srgb_profile() -> bytes:
    return ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()


def spot(
    spot_id: str,
    *,
    uid: str | None = f"users/{OWNER}",
    date: str | None = "2022-03-09T01:00:00.000000Z",
    photos: list[str] | None = None,
    **fields: Any,
) -> dict[str, Any]:
    data: dict[str, Any] = {
        "title": f"title-{spot_id}",
        "comment": "",
        "date": date,
        "last_visited": date,
        "point": {"latitude": 35.0, "longitude": 139.0},
        "score": 1.0,
        "photos": [f"{MAP_PATH}/photos/{p}" for p in photos or []],
        **fields,
    }
    if uid is not None:
        data["uid"] = uid
    return {"id": spot_id, "path": f"{MAP_PATH}/spots/{spot_id}", "data": data}


def photo(photo_id: str, *, date: str | None = None, name: str | None = None) -> dict[str, Any]:
    data: dict[str, Any] = {"key": photo_id, "extension": ".jpg", "date": date, "uid": "x"}
    if name is not None:
        data["name"] = f"{MAP_PATH}/names/{name}"
    return {
        "id": photo_id,
        "path": f"{MAP_PATH}/photos/{photo_id}",
        "data": data,
        "storage_path": f"maps/cats/{photo_id}.jpg",
    }


def name(name_id: str, label: str) -> dict[str, Any]:
    return {
        "id": name_id,
        "path": f"{MAP_PATH}/names/{name_id}",
        "data": {"name": label, "pronounce": "よみ", "memo": "メモ"},
    }


def make_dump(spots: list[dict], photos: list[dict], names: list[dict] | None = None) -> dict:
    return {
        "manifest": {"map_id": "m1"},
        "map": {"id": "m1", "path": MAP_PATH, "data": {"name": "cats"}},
        "spots": spots,
        "photos": photos,
        "names": names or [],
    }


class FakeStorage:
    """GCS の代わり。取ったパスを数える。"""

    def __init__(self, objects: dict[str, bytes]) -> None:
        self.objects = objects
        self.fetched: list[str] = []

    def __call__(self, path: str) -> bytes:
        self.fetched.append(path)
        return self.objects[path]


def export(plans: list[ex.PinPlan], out_dir: Path, storage: ex.FetchPhoto) -> dict[str, Any]:
    manifest, _ = ex.export_bundle(
        plans,
        out_dir=out_dir,
        source={"kind": "walkshare", "map_id": "m1"},
        fetch_photo=storage,
        exported_at=EXPORTED_AT,
    )
    return manifest


# ---------------------------------------------------------------------------
# 範囲の絞り込み・マッピング
# ---------------------------------------------------------------------------


def test_scope_keeps_owner_and_unrecorded_spots_only() -> None:
    """本人のスポットと作成者の記録が無いスポット（uid なし・null）だけを移し、
    もう1つのアカウントのスポットは移さないこと。
    """
    dump = make_dump(
        [
            spot("s1"),
            spot("s2", uid=None),
            spot("s3", uid="users/other", photos=["p3"]),
            {**spot("s4"), "data": {**spot("s4")["data"], "uid": None}},
        ],
        [photo("p3")],
    )

    plans = ex.plan_pins(dump, OWNER)

    assert sorted(p.record["source_id"] for p in plans) == ["s1", "s2", "s4"]


def test_pin_mapping_follows_readme() -> None:
    """名前・メモは前後の空白を除いて空なら null、updated_at は max(date, last_visited)、
    visited は true になること。
    """
    dump = make_dump(
        [
            spot(
                "s1",
                title="  公園 ",
                comment="   ",
                date="2022-03-09T01:00:00.000000Z",
                last_visited="2022-03-01T00:00:00.000000Z",
                point={"latitude": 35.5, "longitude": 139.25},
            ),
            spot("s2", title="", comment=" メモ ", last_visited="2023-01-01T00:00:00.000000Z"),
        ],
        [],
    )

    records = {p.record["source_id"]: p.record for p in ex.plan_pins(dump, OWNER)}

    assert records["s1"] == {
        "source_id": "s1",
        "name": "公園",
        "memo": None,
        "latitude": 35.5,
        "longitude": 139.25,
        "visited": True,
        "archived": False,
        "created_at": "2022-03-09T01:00:00.000000Z",
        # last_visited が作成より前なので、作成日時を使う。
        "updated_at": "2022-03-09T01:00:00.000000Z",
        "tags": [],
    }
    assert (records["s2"]["name"], records["s2"]["memo"]) == (None, "メモ")
    assert records["s2"]["updated_at"] == "2023-01-01T00:00:00.000000Z"


def test_tags_come_from_photo_names_in_photo_order() -> None:
    """タグは写真の順に名前を集め、正規化・重複除去したもので、
    created_at はすべてピンの作成日時になること。
    """
    dump = make_dump(
        [spot("s1", photos=["p1", "p2", "p3", "p4"])],
        [
            photo("p1", name="n2"),
            photo("p2", name="n1"),
            photo("p3", name="n3"),
            photo("p4"),
        ],
        [name("n1", " タマ "), name("n2", "ミケ"), name("n3", "#ミケ")],
    )

    [plan] = ex.plan_pins(dump, OWNER)

    assert plan.record["tags"] == [
        {"label": "ミケ", "created_at": "2022-03-09T01:00:00.000000Z"},
        {"label": "タマ", "created_at": "2022-03-09T01:00:00.000000Z"},
    ]


def test_photo_mapping_keeps_order_and_dates() -> None:
    """写真は spot.photos の順で、taken_at は photo.date（null 可）、
    created_at は max(ピンの作成, taken_at) になること。
    """
    dump = make_dump(
        [spot("s1", photos=["p2", "p1", "p3"], date="2022-03-09T01:00:00.000000Z")],
        [
            photo("p1", date="2022-01-01T00:00:00.000000Z"),
            photo("p2", date="2023-05-01T00:00:00.000000Z"),
            photo("p3"),
        ],
    )

    [plan] = ex.plan_pins(dump, OWNER)

    assert [(p.source_id, p.taken_at, p.created_at) for p in plan.photos] == [
        ("p2", datetime(2023, 5, 1, tzinfo=UTC), datetime(2023, 5, 1, tzinfo=UTC)),
        ("p1", datetime(2022, 1, 1, tzinfo=UTC), datetime(2022, 3, 9, 1, tzinfo=UTC)),
        ("p3", None, datetime(2022, 3, 9, 1, tzinfo=UTC)),
    ]
    assert plan.photos[0].storage_path == "maps/cats/p2.jpg"


@pytest.mark.parametrize(
    ("spot_fields", "photos", "names"),
    [
        ({"photos": [f"{MAP_PATH}/photos/missing"]}, [], []),
        ({"photos": ["maps/other/photos/p1"]}, [photo("p1")], []),
        ({"title": "秘密の場所" * 11}, [], []),
        ({"photos": [f"{MAP_PATH}/photos/p1"]}, [photo("p1", name="missing")], []),
        ({"photos": [f"{MAP_PATH}/photos/p1"]}, [photo("p1", name="n1")], [name("n1", "秘" * 21)]),
        ({"point": {"latitude": 91.0, "longitude": 139.0}}, [], []),
    ],
    ids=["dangling-photo", "other-map", "long-name", "dangling-name", "long-tag", "bad-point"],
)
def test_invalid_spot_stops_without_personal_data(
    spot_fields: dict[str, Any], photos: list[dict], names: list[dict]
) -> None:
    """想定外のスポットは切り詰めずに止まり、文言はバンドルの中の連番だけで、
    名前・タグ・ID を含まないこと。
    """
    dump = make_dump([spot("s0"), spot("secret-spot", **spot_fields)], photos, names)

    with pytest.raises(ex.ExportError) as exc_info:
        ex.plan_pins(dump, OWNER)

    message = str(exc_info.value)
    assert message.startswith("ピン 1")
    for value in ("秘密", "秘", "secret-spot", "p1", "missing", "maps/"):
        assert value not in message


@pytest.mark.parametrize("date", [None, "2022-03-09T01:00:00", "not-a-date"])
def test_spot_without_valid_date_stops_with_position(date: str | None) -> None:
    """作成日時が無い・タイムゾーンが無い・読めないスポットは、並べる前にダンプの中の連番を付けて止まること。"""
    dump = make_dump([spot("s0"), spot("s1", date=date)], [])

    with pytest.raises(ex.ExportError, match=r"^範囲のスポット 1（ダンプの順）"):
        ex.plan_pins(dump, OWNER)


def test_photo_shared_by_two_pins_stops() -> None:
    """同じ写真を2つのピンが参照していれば止まること（写真の ID がピンをまたいで衝突するため）。"""
    dump = make_dump([spot("s1", photos=["p1"]), spot("s2", photos=["p1"])], [photo("p1")])

    with pytest.raises(ex.ExportError, match="同じ写真"):
        ex.plan_pins(dump, OWNER)


def test_limits_match_api_contract() -> None:
    """移行の上限が API の契約（pins/schemas.py）と同じであること。

    書き出しはホストで動かすので schemas を import せず、値を写している。
    """
    from sanposcape.sanpo_maps.pins import schemas

    assert ex.PIN_NAME_MAX_LENGTH == schemas.PIN_NAME_MAX_LENGTH
    assert ex.PIN_MEMO_MAX_LENGTH == schemas.PIN_MEMO_MAX_LENGTH
    assert ex.PIN_TAG_MAX_COUNT == schemas.PIN_TAGS_MAX_COUNT


# ---------------------------------------------------------------------------
# 写真の再圧縮
# ---------------------------------------------------------------------------


def test_recompress_shrinks_long_edge_to_2048_without_exif() -> None:
    """長辺 2048px を超える原本は縦横比を保って長辺 2048px に縮み、
    Exif の無い JPEG（品質 70）になること。
    """
    original = make_jpeg((3000, 2000), noise=True, orientation=1)

    result = ex.recompress(original)

    assert (result.width, result.height) == (2048, 1365)
    assert len(result.jpeg) < len(original)
    with Image.open(io.BytesIO(result.jpeg)) as image:
        assert image.format == "JPEG"
        assert image.size == (2048, 1365)
        assert "exif" not in image.info
        assert len(image.getexif()) == 0
    # 残るメタデータは JFIF だけで、読み込みの除去を通しても変わらない。
    assert strip_jpeg_metadata(result.jpeg) == result.jpeg


def test_recompress_does_not_enlarge_small_image() -> None:
    """長辺 2048px 以下の原本は拡大しないこと。"""
    result = ex.recompress(make_jpeg((640, 480)))

    assert (result.width, result.height) == (640, 480)


def test_recompress_applies_exif_orientation_to_pixels() -> None:
    """EXIF の向き（6 = 時計回りに 90 度）を画素に反映し、
    縦横が入れ替わって左端の色が上端に来ること。
    """
    image = Image.new("RGB", (200, 100), (0, 0, 255))
    image.paste((255, 0, 0), (0, 0, 100, 100))  # 左半分が赤
    exif = Image.Exif()
    exif[_ORIENTATION_TAG] = 6
    buffer = io.BytesIO()
    image.save(buffer, format="JPEG", quality=95, exif=exif.tobytes())

    result = ex.recompress(buffer.getvalue())

    assert (result.width, result.height) == (100, 200)
    with Image.open(io.BytesIO(result.jpeg)) as rotated:
        top = rotated.convert("RGB").getpixel((50, 20))
        bottom = rotated.convert("RGB").getpixel((50, 180))
    assert top[0] > 200 and top[2] < 60
    assert bottom[2] > 200 and bottom[0] < 60


def test_recompress_keeps_icc_profile_of_rgb_original() -> None:
    """RGB の原本の ICC プロファイルは引き継ぎ、集計にはプロファイルの説明が出ること。"""
    profile = srgb_profile()

    result = ex.recompress(make_jpeg(icc_profile=profile))

    with Image.open(io.BytesIO(result.jpeg)) as image:
        assert image.info.get("icc_profile") == profile
    assert "sRGB" in result.icc


def test_recompress_drops_icc_profile_of_non_rgb_original() -> None:
    """グレーの原本は RGB に変換し、ICC は変換後の色空間と合わないので付けないこと。"""
    gray_profile = ImageCms.ImageCmsProfile(ImageCms.createProfile("LAB")).tobytes()

    result = ex.recompress(make_jpeg(mode="L", icc_profile=gray_profile))

    with Image.open(io.BytesIO(result.jpeg)) as image:
        assert image.mode == "RGB"
        assert "icc_profile" not in image.info
    assert result.icc == "none"


def test_recompress_rejects_non_jpeg() -> None:
    """JPEG 以外の原本は止まること。"""
    buffer = io.BytesIO()
    Image.new("RGB", (10, 10)).save(buffer, format="PNG")

    with pytest.raises(ex.ExportError, match="JPEG"):
        ex.recompress(buffer.getvalue())


# ---------------------------------------------------------------------------
# バンドルの書き出し・再開
# ---------------------------------------------------------------------------


def _sample() -> tuple[list[ex.PinPlan], FakeStorage]:
    dump = make_dump(
        [spot("s1", photos=["p1", "p2"]), spot("s2", date="2022-04-01T00:00:00.000000Z")],
        [photo("p1", date="2022-03-01T00:00:00.000000Z", name="n1"), photo("p2")],
        [name("n1", "タマ")],
    )
    storage = FakeStorage(
        {
            "maps/cats/p1.jpg": make_jpeg((4032, 3024)),
            "maps/cats/p2.jpg": make_jpeg((100, 80)),
        }
    )
    return ex.plan_pins(dump, OWNER), storage


def test_export_writes_bundle_in_readme_format(tmp_path: Path) -> None:
    """pins.json・photos/・manifest.json を README の形で書き、件数・容量・sha256 が中身と合い、
    権限が 0700/0600 になること。
    """
    plans, storage = _sample()
    out_dir = tmp_path / "bundle"

    manifest = export(plans, out_dir, storage)

    pins_bytes = (out_dir / "pins.json").read_bytes()
    pins = json.loads(pins_bytes)["pins"]
    assert [p["source_id"] for p in pins] == ["s1", "s2"]
    p1 = pins[0]["photos"][0]
    p1_bytes = (out_dir / "photos" / "p1.jpg").read_bytes()
    assert p1 == {
        "source_id": "p1",
        "file": "photos/p1.jpg",
        "position": 0,
        "taken_at": "2022-03-01T00:00:00.000000Z",
        "created_at": "2022-03-09T01:00:00.000000Z",
        "byte_size": len(p1_bytes),
        "width": 2048,
        "height": 1536,
        "sha256": bundle.sha256_hex(p1_bytes),
    }
    assert pins[0]["photos"][1]["taken_at"] is None
    assert pins[0]["tags"] == [{"label": "タマ", "created_at": "2022-03-09T01:00:00.000000Z"}]
    assert pins[1]["photos"] == []

    assert manifest == {
        "format_version": 1,
        "source": {"kind": "walkshare", "map_id": "m1"},
        "exported_at": "2026-10-26T00:00:00.000000Z",
        "counts": {"pins": 2, "photos": 2, "tags": 1},
        "photo_bytes_total": sum(p["byte_size"] for p in pins[0]["photos"]),
        "pins_sha256": bundle.sha256_hex(pins_bytes),
    }
    assert json.loads((out_dir / "manifest.json").read_text()) == manifest

    assert stat.S_IMODE(out_dir.stat().st_mode) == 0o700
    assert stat.S_IMODE((out_dir / "photos").stat().st_mode) == 0o700
    for path in [out_dir / "pins.json", out_dir / "manifest.json", out_dir / "photos" / "p1.jpg"]:
        assert stat.S_IMODE(path.stat().st_mode) == 0o600


def test_rerun_skips_photos_whose_sha256_matches(tmp_path: Path) -> None:
    """2回目は、記録と sha256 が合う写真を GCS から取らず、
    壊れた写真だけを取り直して同じバンドルになること。
    """
    plans, storage = _sample()
    out_dir = tmp_path / "bundle"
    first = export(plans, out_dir, storage)
    first_pins = (out_dir / "pins.json").read_bytes()
    (out_dir / "photos" / "p2.jpg").write_bytes(b"broken")
    storage.fetched.clear()

    second = export(plans, out_dir, storage)

    assert storage.fetched == ["maps/cats/p2.jpg"]
    assert (out_dir / "pins.json").read_bytes() == first_pins
    assert second == first


def test_rerun_after_truncated_progress_line_keeps_later_records(tmp_path: Path) -> None:
    """記録の最後の行が途中で切れていても、次の実行の記録は読める行として残り、
    3回目は GCS から取らないこと。
    """
    plans, storage = _sample()
    out_dir = tmp_path / "bundle"
    export(plans, out_dir, storage)
    progress = out_dir / ".progress.jsonl"
    lines = progress.read_text().splitlines()
    # p2 の行が書きかけで止まった状態にする。
    progress.write_text(lines[0] + "\n" + lines[1][:10])
    storage.fetched.clear()

    export(plans, out_dir, storage)
    assert storage.fetched == ["maps/cats/p2.jpg"]
    storage.fetched.clear()
    export(plans, out_dir, storage)

    assert storage.fetched == []


def test_rerun_removes_photos_no_longer_in_dump(tmp_path: Path) -> None:
    """ダンプから外れた写真と書きかけのファイルは、書き直しで photos/ から消えること。"""
    plans, storage = _sample()
    out_dir = tmp_path / "bundle"
    export(plans, out_dir, storage)
    (out_dir / "photos" / ".p9.jpg.partial").write_bytes(b"x")
    only_first_photo = [ex.PinPlan(record=plans[0].record, photos=plans[0].photos[:1])]

    manifest = export(only_first_photo, out_dir, storage)

    assert sorted(p.name for p in (out_dir / "photos").iterdir()) == ["p1.jpg"]
    assert manifest["counts"]["photos"] == 1


def test_failed_photo_reports_position_only_and_leaves_no_manifest(tmp_path: Path) -> None:
    """写真の取得に失敗すると、例外の文言（Storage のパス）は出さずに連番と型だけを出し、
    manifest を残さないこと。
    """
    plans, _ = _sample()

    def failing(path: str) -> bytes:
        raise RuntimeError(f"404 {path}")

    with pytest.raises(ex.ExportError) as exc_info:
        export(plans, tmp_path / "bundle", failing)

    assert str(exc_info.value) == "ピン 0 の写真 0: RuntimeError"
    assert not (tmp_path / "bundle" / "manifest.json").exists()


# ---------------------------------------------------------------------------
# 入口（config・置き場所・出力）
# ---------------------------------------------------------------------------


def _prepare_work_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    work_dir = tmp_path / "walkshare-migration"
    monkeypatch.setattr(bundle, "WORK_DIR", work_dir)
    dump_dir = work_dir / "dump"
    dump_dir.mkdir(parents=True)
    dump = make_dump([spot("s1", photos=["p1"])], [photo("p1")])
    for key, content in dump.items():
        (dump_dir / f"{key}.json").write_text(json.dumps(content))
    (work_dir / "config.json").write_text(
        json.dumps(
            {"firebase_project": "proj", "map_id": "m1", "bucket": "bkt", "owner_uid": OWNER}
        )
    )
    return work_dir


def _main(work_dir: Path, out: Path | None = None) -> int:
    return ex.main(
        [
            "--config",
            str(work_dir / "config.json"),
            "--dump",
            str(work_dir / "dump"),
            "--out",
            str(out or work_dir / "bundle"),
        ]
    )


def test_main_exports_bundle_from_config_and_prints_counts_only(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """config のプロジェクト・バケット・uid で書き出し、標準出力には件数・容量だけを出して、
    ID・名前を出さないこと。
    """
    work_dir = _prepare_work_dir(tmp_path, monkeypatch)
    storage = FakeStorage({"maps/cats/p1.jpg": make_jpeg()})
    opened: list[tuple[str, str]] = []

    def fake_fetcher(project: str, bucket_name: str) -> ex.FetchPhoto:
        opened.append((project, bucket_name))
        return storage

    monkeypatch.setattr(ex, "gcs_fetcher", fake_fetcher)

    assert _main(work_dir) == 0

    assert opened == [("proj", "bkt")]
    out = capsys.readouterr().out
    assert json.loads(out)["counts"] == {"pins": 1, "photos": 1, "tags": 0}
    for value in ("s1", "p1", "title-s1", OWNER, "maps/"):
        assert value not in out
    assert (work_dir / "bundle" / "manifest.json").exists()


def test_main_prints_only_exception_type(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    """GCS の例外の文言（パス）は出さず、連番と型だけを標準エラーに出して 1 で終わること。"""
    work_dir = _prepare_work_dir(tmp_path, monkeypatch)

    def failing(path: str) -> bytes:
        raise RuntimeError(f"404 {path}")

    monkeypatch.setattr(ex, "gcs_fetcher", lambda project, bucket_name: failing)

    assert _main(work_dir) == 1

    captured = capsys.readouterr()
    assert captured.err == "error: ピン 0 の写真 0: RuntimeError\n"
    assert captured.out == ""


def test_main_refuses_bundle_outside_work_dir(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """作業ディレクトリの外への書き出しは、GCS に繋ぐ前に止まり、何も書かないこと。"""
    work_dir = _prepare_work_dir(tmp_path, monkeypatch)
    monkeypatch.setattr(ex, "gcs_fetcher", lambda project, bucket_name: pytest.fail("fetched"))

    assert _main(work_dir, out=tmp_path / "outside") == 1

    assert not (tmp_path / "outside").exists()


# ---------------------------------------------------------------------------
# 置き場所
# ---------------------------------------------------------------------------


def test_bundle_must_be_inside_work_dir(tmp_path: Path) -> None:
    """バンドル・ダンプの置き場所は作業ディレクトリの中だけを許し、
    外や作業ディレクトリ自身・`..` で出る道は拒むこと。
    """
    work_dir = tmp_path / "walkshare-migration"
    work_dir.mkdir()

    assert bundle.require_inside_work_dir(work_dir / "b", work_dir=work_dir) == work_dir / "b"
    for path in [tmp_path / "elsewhere", work_dir, work_dir / ".." / "b"]:
        with pytest.raises(bundle.BundleError):
            bundle.require_inside_work_dir(path, work_dir=work_dir)


def test_make_private_dir_creates_missing_parents_as_0700(tmp_path: Path) -> None:
    """足りない親ディレクトリも 0700 で作ること。

    mkdir(parents=True) で作る親は既定の権限になるため。
    """
    target = tmp_path / "a" / "b" / "c"

    bundle.make_private_dir(target)

    for directory in [tmp_path / "a", tmp_path / "a" / "b", target]:
        assert stat.S_IMODE(directory.stat().st_mode) == 0o700


def test_make_private_dir_refuses_symlink(tmp_path: Path) -> None:
    """置き場所が symlink なら、その先の権限を変えずに止まること。"""
    elsewhere = tmp_path / "elsewhere"
    elsewhere.mkdir(mode=0o755)
    elsewhere.chmod(0o755)
    link = tmp_path / "link"
    link.symlink_to(elsewhere)

    with pytest.raises(bundle.BundleError):
        bundle.make_private_dir(link)

    assert stat.S_IMODE(elsewhere.stat().st_mode) == 0o755


def test_write_private_bytes_does_not_follow_symlink(tmp_path: Path) -> None:
    """書きかけの名前に symlink が置かれていても、その先のファイルを書き換えないこと。"""
    victim = tmp_path / "victim"
    victim.write_bytes(b"original")
    (tmp_path / ".out.json.partial").symlink_to(victim)

    with pytest.raises(OSError):
        bundle.write_private_bytes(tmp_path / "out.json", b"new")

    assert victim.read_bytes() == b"original"


def test_export_does_not_follow_symlinked_progress_file(tmp_path: Path) -> None:
    """再開の記録が symlink なら、その先に追記せずに止まること。"""
    plans, storage = _sample()
    out_dir = tmp_path / "bundle"
    out_dir.mkdir()
    victim = tmp_path / "victim"
    victim.write_text("")
    (out_dir / ".progress.jsonl").symlink_to(victim)

    with pytest.raises(OSError):
        export(plans, out_dir, storage)

    assert victim.read_text() == ""


def test_write_private_bytes_makes_leftover_partial_0600(tmp_path: Path) -> None:
    """0644 の書きかけが残っていても、書き上げたファイルは 0600 になること。"""
    partial = tmp_path / ".out.json.partial"
    partial.write_bytes(b"old")
    partial.chmod(0o644)

    bundle.write_private_bytes(tmp_path / "out.json", b"new")

    assert stat.S_IMODE((tmp_path / "out.json").stat().st_mode) == 0o600

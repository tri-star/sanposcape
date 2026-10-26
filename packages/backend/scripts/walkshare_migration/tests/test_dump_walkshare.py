"""dump_walkshare.py の変換・組み立てのテスト（Firestore には繋がない。
値の型は代わりのクラスで作る）。
"""

import json
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, timezone

import bundle
import dump_walkshare as dw
import pytest


@dataclass
class FakeReference:
    path: str

    @property
    def id(self) -> str:
        return self.path.rsplit("/", 1)[-1]


@dataclass
class FakeGeoPoint:
    latitude: float
    longitude: float


def test_to_json_value_converts_firestore_types() -> None:
    """Timestamp は UTC の ISO 8601、GeoPoint は緯度経度、DocumentReference はパスになり、
    入れ子も変換されること。
    """
    value = {
        "date": datetime(2021, 4, 1, 9, 0, tzinfo=timezone(timedelta(hours=9))),
        "point": FakeGeoPoint(35.5, 139.25),
        "photos": [FakeReference("maps/m1/photos/p1")],
        "uid": FakeReference("users/u1"),
        "score": 1.0,
        "last_visited": None,
    }

    assert dw.to_json_value(value) == {
        "date": "2021-04-01T00:00:00.000000Z",
        "point": {"latitude": 35.5, "longitude": 139.25},
        "photos": ["maps/m1/photos/p1"],
        "uid": "users/u1",
        "score": 1.0,
        "last_visited": None,
    }


def test_to_json_value_rejects_unknown_type() -> None:
    """変換できない型は黙って落とさずに止まること。"""
    with pytest.raises(dw.DumpError, match="bytes"):
        dw.to_json_value({"blob": b"\x00"})


def test_build_dump_adds_storage_path() -> None:
    """写真には原本の Storage のパス（maps/{地図名}/{key}{extension}）が付き、
    各一覧は ID の順に並ぶこと。
    """
    taken = datetime(2022, 1, 1, tzinfo=UTC)
    dump = dw.build_dump(
        map_id="m1",
        map_path="maps/m1",
        map_data={"name": "cats"},
        documents={
            "spots": [("s2", "maps/m1/spots/s2", {}), ("s1", "maps/m1/spots/s1", {})],
            "photos": [
                ("p1", "maps/m1/photos/p1", {"key": "p1", "extension": ".jpg", "date": taken})
            ],
            "names": [],
        },
    )

    assert [s["id"] for s in dump["spots"]] == ["s1", "s2"]
    assert dump["photos"] == [
        {
            "id": "p1",
            "path": "maps/m1/photos/p1",
            "data": {"key": "p1", "extension": ".jpg", "date": "2022-01-01T00:00:00.000000Z"},
            "storage_path": "maps/cats/p1.jpg",
        }
    ]
    assert dump["map"] == {"id": "m1", "path": "maps/m1", "data": {"name": "cats"}}


def test_build_dump_stops_when_photo_key_differs_from_id() -> None:
    """写真の key がドキュメントの ID と違えば（原本のパスを推定できないので）止まること。"""
    with pytest.raises(dw.DumpError, match="key"):
        dw.build_dump(
            map_id="m1",
            map_path="maps/m1",
            map_data={"name": "cats"},
            documents={
                "spots": [],
                "photos": [("p1", "maps/m1/photos/p1", {"key": "p2", "extension": ".jpg"})],
                "names": [],
            },
        )


def test_write_dump_removes_old_manifest_before_overwriting(tmp_path, monkeypatch) -> None:
    """上書きで書き直しの途中に止まると manifest が無い状態になり、古い manifest が残らないこと。"""
    out_dir = tmp_path / "dump"
    dump = {"map": {}, "spots": [], "photos": [], "names": []}
    dw.write_dump(out_dir, dump, {"format_version": 1})

    def fail(path, data):
        raise OSError("disk full")

    monkeypatch.setattr(dw.bundle, "write_private_bytes", fail)
    with pytest.raises(OSError):
        dw.write_dump(out_dir, dump, {"format_version": 1})

    assert not (out_dir / "manifest.json").exists()


def test_main_refuses_to_overwrite_existing_dump(tmp_path, monkeypatch, capsys) -> None:
    """既存のダンプがあれば --overwrite なしでは Firestore に繋がずに止まること。"""
    work_dir = tmp_path / "walkshare-migration"
    (work_dir / "dump").mkdir(parents=True)
    (work_dir / "dump" / "manifest.json").write_text("{}")
    config = work_dir / "config.json"
    config.write_text(json.dumps({"firebase_project": "proj", "map_id": "m1"}))
    monkeypatch.setattr(bundle, "WORK_DIR", work_dir)
    monkeypatch.setattr(dw, "fetch_from_firestore", lambda *args: pytest.fail("fetched"))

    assert dw.main(["--config", str(config), "--out", str(work_dir / "dump")]) == 1

    assert "--overwrite" in capsys.readouterr().err

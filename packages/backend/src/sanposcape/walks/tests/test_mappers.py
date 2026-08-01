import uuid
from datetime import UTC, datetime

import pytest

from sanposcape.core.geo import GeoPoint
from sanposcape.walks.mappers import (
    to_walk_detail_read,
    to_walk_read,
    track_from_storage,
    track_to_storage,
)
from sanposcape.walks.models import Walk


def _make_walk(**overrides: object) -> Walk:
    defaults: dict[str, object] = {
        "id": uuid.uuid4(),
        "user_id": uuid.uuid4(),
        "client_walk_id": uuid.uuid4(),
        "started_at": datetime(2026, 8, 1, 9, 0, 0, tzinfo=UTC),
        "ended_at": datetime(2026, 8, 1, 9, 30, 0, tzinfo=UTC),
        "duration_seconds": 1800,
        "distance_meters": 2000,
        "destination_place_id": "place-1",
        "destination_name": "テスト公園",
        "destination_latitude": 35.68,
        "destination_longitude": 139.76,
        "track_points": [],
        "created_at": datetime(2026, 8, 1, 9, 30, 5, tzinfo=UTC),
    }
    defaults.update(overrides)
    return Walk(**defaults)


class TestTrackConversion:
    def test_track_to_storage_rounds_to_six_digits(self) -> None:
        points = [GeoPoint(latitude=35.1234567, longitude=139.9876543)]

        stored = track_to_storage(points)

        assert stored == [[35.123457, 139.987654]]

    def test_track_to_storage_empty_list(self) -> None:
        assert track_to_storage([]) == []

    def test_track_round_trip(self) -> None:
        points = [
            GeoPoint(latitude=35.681236, longitude=139.767125),
            GeoPoint(latitude=35.681300, longitude=139.767200),
        ]

        round_tripped = track_from_storage(track_to_storage(points))

        assert round_tripped == points

    def test_track_from_storage_empty_list(self) -> None:
        assert track_from_storage([]) == []

    @pytest.mark.parametrize(
        "raw",
        [
            [[35.0]],  # 要素数が1
            [[35.0, 139.0, 0.0]],  # 要素数が3
            [["not-a-number", 139.0]],  # 数値でない
            [[35.0, "not-a-number"]],
            ["not-a-row"],
        ],
    )
    def test_track_from_storage_rejects_malformed_rows(self, raw: list) -> None:
        with pytest.raises(ValueError, match="invalid track point row"):
            track_from_storage(raw)


class TestWalkReadMapping:
    def test_to_walk_read_maps_flat_destination_columns_to_nested_schema(self) -> None:
        walk = _make_walk()

        result = to_walk_read(walk)

        assert result.id == walk.id
        assert result.client_walk_id == walk.client_walk_id
        assert result.destination.place_id == walk.destination_place_id
        assert result.destination.name == walk.destination_name
        assert result.destination.location == GeoPoint(
            latitude=walk.destination_latitude, longitude=walk.destination_longitude
        )

    def test_to_walk_detail_read_includes_track(self) -> None:
        walk = _make_walk(track_points=[[35.681236, 139.767125]])

        result = to_walk_detail_read(walk)

        assert result.track == [GeoPoint(latitude=35.681236, longitude=139.767125)]

    def test_to_walk_detail_read_with_corrupted_track_points_raises(self) -> None:
        walk = _make_walk(track_points=[[35.0]])

        with pytest.raises(ValueError, match="invalid track point row"):
            to_walk_detail_read(walk)

"""service層の戻り値（Walk モデル）をレスポンススキーマへ変換するマッパー。

`Walk` は目的地をフラットな列で持つため `from_attributes` では表現できず、
`auth/mappers.py` と同じ形で明示的な変換関数を用意する。
"""

from sanposcape.core.geo import GeoPoint
from sanposcape.walks.models import Walk
from sanposcape.walks.schemas import WalkDestinationRead, WalkDetailRead, WalkRead

# 座標の丸め桁数。約0.11m相当で GPS 精度より十分細かく、JSONB の行サイズを抑える。
TRACK_COORDINATE_DIGITS = 6


def track_to_storage(points: list[GeoPoint]) -> list[list[float]]:
    """API から受け取った軌跡を JSONB 保存用の `[[lat, lng], ...]` に変換する。"""
    return [
        [
            round(point.latitude, TRACK_COORDINATE_DIGITS),
            round(point.longitude, TRACK_COORDINATE_DIGITS),
        ]
        for point in points
    ]


def track_from_storage(raw: list) -> list[GeoPoint]:
    """JSONB に保存された軌跡を API レスポンス用の `list[GeoPoint]` に変換する。

    DB 側の壊れたデータ（要素数が2でない・数値でない）は握りつぶさず例外にする。
    """
    points: list[GeoPoint] = []
    for row in raw:
        if not isinstance(row, list | tuple) or len(row) != 2:
            raise ValueError(f"invalid track point row (expected [lat, lng]): {row!r}")
        latitude, longitude = row
        if not isinstance(latitude, int | float) or not isinstance(longitude, int | float):
            raise ValueError(f"invalid track point row (non-numeric value): {row!r}")
        points.append(GeoPoint(latitude=latitude, longitude=longitude))
    return points


def to_walk_read(walk: Walk) -> WalkRead:
    return WalkRead(
        id=walk.id,
        client_walk_id=walk.client_walk_id,
        started_at=walk.started_at,
        ended_at=walk.ended_at,
        duration_seconds=walk.duration_seconds,
        distance_meters=walk.distance_meters,
        destination=WalkDestinationRead(
            place_id=walk.destination_place_id,
            name=walk.destination_name,
            location=GeoPoint(
                latitude=walk.destination_latitude,
                longitude=walk.destination_longitude,
            ),
        ),
        created_at=walk.created_at,
    )


def to_walk_detail_read(walk: Walk) -> WalkDetailRead:
    base = to_walk_read(walk)
    return WalkDetailRead(**base.model_dump(), track=track_from_storage(walk.track_points))

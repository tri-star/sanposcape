"""周回ルート判定で使う、DB も HTTP も持たない純粋な幾何関数。

`walks/stats.py` と同じ位置づけ（folder-structure.md「現在時刻の扱い」節）。
ここに置く関数は座標の変換・補間・グリッド分割だけを行い、Google や DB の型を知らない
（`ProviderPoint` / `ProviderRoute` のみに依存する）。

前回ブランチ（`origin/tri-star/SS-33`）の幾何関数を参考にしているが、経度の扱いは
`fake.py` の `_clamp`（GeoPoint の範囲に丸めるだけ）とは異なり、こちらは日付変更線を
跨ぐ経路でも破綻しないよう `_normalize_longitude` で ±180° に折り返す。
"""

from itertools import pairwise
from math import asin, atan2, cos, degrees, hypot, radians, sin

from sanposcape.integrations.google_maps.provider import ProviderPoint

_EARTH_RADIUS_METERS = 6_371_008.8


def haversine_meters(a: ProviderPoint, b: ProviderPoint) -> float:
    """2点間の大円距離（メートル）。"""
    lat1, lon1 = radians(a.latitude), radians(a.longitude)
    lat2, lon2 = radians(b.latitude), radians(b.longitude)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    sin_dlat = sin(dlat / 2)
    sin_dlon = sin(dlon / 2)
    h = sin_dlat * sin_dlat + cos(lat1) * cos(lat2) * sin_dlon * sin_dlon
    h = max(0.0, min(1.0, h))
    return 2 * _EARTH_RADIUS_METERS * asin(h**0.5)


def bearing_degrees(a: ProviderPoint, b: ProviderPoint) -> float:
    """a から b への初期方位角（真北 0°、時計回り、[0, 360)）。"""
    lat1, lon1 = radians(a.latitude), radians(a.longitude)
    lat2, lon2 = radians(b.latitude), radians(b.longitude)
    dlon = lon2 - lon1
    x = sin(dlon) * cos(lat2)
    y = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(dlon)
    return degrees(atan2(x, y)) % 360


def midpoint(a: ProviderPoint, b: ProviderPoint) -> ProviderPoint:
    """a・b を結ぶ大円上の中点。"""
    lat1, lon1 = radians(a.latitude), radians(a.longitude)
    lat2, lon2 = radians(b.latitude), radians(b.longitude)
    dlon = lon2 - lon1
    bx = cos(lat2) * cos(dlon)
    by = cos(lat2) * sin(dlon)
    lat3 = atan2(sin(lat1) + sin(lat2), hypot(cos(lat1) + bx, by))
    lon3 = lon1 + atan2(by, cos(lat1) + bx)
    return ProviderPoint(latitude=degrees(lat3), longitude=_normalize_longitude(degrees(lon3)))


def offset_point(origin: ProviderPoint, bearing: float, distance_meters: float) -> ProviderPoint:
    """origin から `bearing`（真北0°、時計回り）方向へ `distance_meters` 進んだ点。"""
    angular_distance = distance_meters / _EARTH_RADIUS_METERS
    lat1 = radians(origin.latitude)
    brng = radians(bearing)
    sin_lat2 = sin(lat1) * cos(angular_distance) + cos(lat1) * sin(angular_distance) * cos(brng)
    sin_lat2 = max(-1.0, min(1.0, sin_lat2))
    lat2 = asin(sin_lat2)
    y = sin(brng) * sin(angular_distance) * cos(lat1)
    x = cos(angular_distance) - sin(lat1) * sin(lat2)
    lon2 = radians(origin.longitude) + atan2(y, x)
    return ProviderPoint(latitude=degrees(lat2), longitude=_normalize_longitude(degrees(lon2)))


def resample(path: tuple[ProviderPoint, ...], step_meters: float) -> tuple[ProviderPoint, ...]:
    """折れ線 `path` を、始点・終点を含みおおよそ `step_meters` 間隔になるよう再標本化する。

    最後の区間は `step_meters` より短くなり得る（終点を必ず含めるため）。`path` が空か
    1点だけの場合はそのまま返す。
    """
    if len(path) < 2 or step_meters <= 0:
        return path
    points: list[ProviderPoint] = [path[0]]
    distance_covered = 0.0
    next_target = step_meters
    for start, end in pairwise(path):
        segment_length = haversine_meters(start, end)
        if segment_length <= 0:
            continue
        while next_target <= distance_covered + segment_length:
            fraction = (next_target - distance_covered) / segment_length
            points.append(_interpolate(start, end, fraction))
            next_target += step_meters
        distance_covered += segment_length
    if points[-1] != path[-1]:
        points.append(path[-1])
    return tuple(points)


def grid_cells(
    points: tuple[ProviderPoint, ...], anchor: ProviderPoint, cell_size_meters: float
) -> tuple[tuple[int, int], ...]:
    """`anchor` を原点とする等距円筒近似の平面に投影し、`cell_size_meters` 四方のセル座標を返す。

    セル座標は `(北方向のセル番号, 東方向のセル番号)`。近距離（数km以内）でのみ意味のある近似。
    """
    cos_anchor_latitude = cos(radians(anchor.latitude))
    cells: list[tuple[int, int]] = []
    for point in points:
        north_meters = radians(point.latitude - anchor.latitude) * _EARTH_RADIUS_METERS
        east_meters = (
            radians(point.longitude - anchor.longitude) * _EARTH_RADIUS_METERS * cos_anchor_latitude
        )
        cells.append(
            (
                int(north_meters // cell_size_meters),
                int(east_meters // cell_size_meters),
            )
        )
    return tuple(cells)


def _interpolate(a: ProviderPoint, b: ProviderPoint, fraction: float) -> ProviderPoint:
    """a → b の線形補間点（`fraction=0` で a、`1` で b）。短距離の再標本化専用の簡易近似。"""
    return ProviderPoint(
        latitude=a.latitude + (b.latitude - a.latitude) * fraction,
        longitude=a.longitude + (b.longitude - a.longitude) * fraction,
    )


def _normalize_longitude(longitude_degrees: float) -> float:
    """経度を `[-180, 180)` に折り返す（日付変更線をまたいでも `GeoPoint` の範囲を破らない）。"""
    return (longitude_degrees + 180) % 360 - 180

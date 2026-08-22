"""周回ルート(SS-33)の経由点生成と妥当性評価。

外部 I/O(DB・HTTP)を一切持たない純粋関数だけを置く層。`maps/service.py`(周回の
受け入れポリシー・再試行・フォールバック)と `integrations/google_maps/`(通信)から
使われる(backend-plan.md 決定1)。
"""

from collections.abc import Sequence
from dataclasses import dataclass
from math import asin, atan2, cos, degrees, radians, sin, sqrt

from sanposcape.integrations.google_maps.provider import ProviderPoint, ProviderRouteLeg

EARTH_RADIUS_METERS = 6_371_008.8

# α₀: 復路用経由点のオフセット係数(中点から α × haversine(O, D) だけ直交方向へずらす)。
#
# 数値の根拠: 2026-08-22 実 Google Routes API スパイク(tmp/SS-33/routes-api-spike.md)。
# 出発地3点 × 目的地3件(直線 約600m/1.2km/2km) × α ∈ {0.15, 0.25, 0.35, 0.4, 0.6, 0.8} ×
# 左右2方向 = 108試行の実測。
#
# 素案は 0.5〜0.7 だったが、実測では**α が大きいほど迂回率・復路/往路の時間比が悪化する**
# (α=0.6 で迂回率中央値 1.34〜1.40・ret比中央値 1.69〜1.79、α=0.8 で迂回率中央値 1.56・
# ret比中央値 2.11〜2.14)。逆に重複率は α にほぼ反比例して素直に下がり、α=0.25 でも
# 中央値 0.147〜0.203 と十分低い(「復路が往路と同じ道になる」というリスクは実測では
# ほとんど顕在化しなかった)。α=0.15 まで下げると今度は重複率が跳ねる(left で p75 0.660)。
# → 拘束条件は重複率ではなく迂回率と ret/out 比であり、**α は小さいほど良い**という、
# 素案とは逆の結論になった。0.25 が実測上の最適点。
WAYPOINT_OFFSET_RATIO = 0.25

# これ未満(O ≒ D)は周回を作らない。数十m ではオフセットしても意味のある迂回にならない。
MIN_LOOP_BASE_DISTANCE_METERS = 50.0

# 妥当性チェックのしきい値。いずれも 2026-08-22 スパイク(α=0.25・左右18試行)の
# 最悪ケース実測をそのまま採用(「ぎりぎり通す」値)。最悪ケースは**郊外(若葉台)×
# 短距離(486m)**で、道の選択肢が少ない条件(routes-api-spike.md の「(a) 経由点方式の
# 品質」節・「α=0.25 のペア別内訳」参照)。実運用でこの近傍のケースが落ちて再試行/
# フォールバックに回ることは想定内。
MAX_RETURN_TO_OUTBOUND_RATIO = 1.8  # 復路 leg の時間 ÷ 往路 leg の時間（実測 最大 1.796）
MAX_TOTAL_TO_STRAIGHT_RATIO = 1.4  # 周回の総時間 ÷ (往路 × 2)          （実測 最大 1.397）
MAX_PATH_OVERLAP_RATIO = 0.6  # 往路/復路の折れ線の重複率（実測 最大 0.568）

# 重複率(Jaccard)を計算する際のグリッドの一辺(m)。折れ線は OVERLAP_RESAMPLE_STEP_METERS
# 間隔に補間してからスナップする(スパイクと同じ定義。routes-api-spike.md「指標の定義」)。
OVERLAP_GRID_METERS = 20.0
OVERLAP_RESAMPLE_STEP_METERS = 10.0


@dataclass(frozen=True)
class LoopVerdict:
    """周回1回分の試行に対する妥当性評価の結果。

    `accepted=False` のとき `reason` に不採用理由(しきい値超過の内訳)を文字列で持たせる。
    各指標の実測値も保持するのは、本番ログに出して実地の分布を後から検証できるようにするため
    (backend-plan.md Step 3 実装のヒント)。
    """

    accepted: bool
    reason: str | None
    return_to_outbound_ratio: float
    total_to_straight_ratio: float
    path_overlap_ratio: float


def haversine_meters(a: ProviderPoint, b: ProviderPoint) -> float:
    """2点間の大圏距離(m)。fake.py の等距円筒近似とは異なり素直な haversine を使う。

    経由点の生成は方位に敏感なため、近似を重ねない(backend-plan.md Step 3 実装のヒント)。
    """
    lat1, lat2 = radians(a.latitude), radians(b.latitude)
    delta_lat = lat2 - lat1
    delta_lon = radians(b.longitude - a.longitude)
    sin_half_lat = sin(delta_lat / 2)
    sin_half_lon = sin(delta_lon / 2)
    h = sin_half_lat * sin_half_lat + cos(lat1) * cos(lat2) * sin_half_lon * sin_half_lon
    h = min(1.0, max(0.0, h))
    return 2 * EARTH_RADIUS_METERS * asin(sqrt(h))


def bearing_degrees(a: ProviderPoint, b: ProviderPoint) -> float:
    """a から b への初期方位角(度・北=0、時計回り、[0, 360) に正規化)。"""
    lat1, lat2 = radians(a.latitude), radians(b.latitude)
    delta_lon = radians(b.longitude - a.longitude)
    x = sin(delta_lon) * cos(lat2)
    y = cos(lat1) * sin(lat2) - sin(lat1) * cos(lat2) * cos(delta_lon)
    return degrees(atan2(x, y)) % 360.0


def midpoint(a: ProviderPoint, b: ProviderPoint) -> ProviderPoint:
    """a, b を結ぶ大圏の中点。"""
    lat1, lat2 = radians(a.latitude), radians(b.latitude)
    lon1 = radians(a.longitude)
    delta_lon = radians(b.longitude - a.longitude)
    bx = cos(lat2) * cos(delta_lon)
    by = cos(lat2) * sin(delta_lon)
    lat_mid = atan2(sin(lat1) + sin(lat2), sqrt((cos(lat1) + bx) ** 2 + by**2))
    lon_mid = lon1 + atan2(by, cos(lat1) + bx)
    return _normalize(ProviderPoint(latitude=degrees(lat_mid), longitude=degrees(lon_mid)))


def offset_point(point: ProviderPoint, bearing: float, meters: float) -> ProviderPoint:
    """`point` から方位 `bearing`(度)へ `meters` 進んだ点。

    座標の正規化は緯度をクランプ(±90)・経度をラップ((lon+180)%360-180)する。
    日付変更線をまたぐ経由点が生成され得るため、fake.py の等距円筒近似(経度もクランプ)
    とは異なりラップにする(backend-plan.md Step 3 実装のヒント)。
    """
    angular_distance = meters / EARTH_RADIUS_METERS
    theta = radians(bearing)
    lat1 = radians(point.latitude)
    lon1 = radians(point.longitude)

    lat2 = asin(sin(lat1) * cos(angular_distance) + cos(lat1) * sin(angular_distance) * cos(theta))
    lon2 = lon1 + atan2(
        sin(theta) * sin(angular_distance) * cos(lat1),
        cos(angular_distance) - sin(lat1) * sin(lat2),
    )
    return _normalize(ProviderPoint(latitude=degrees(lat2), longitude=degrees(lon2)))


def loop_waypoint_candidates(
    origin: ProviderPoint, destination: ProviderPoint
) -> tuple[ProviderPoint, ...]:
    """試行順に並んだ復路用経由点(最大2件)。

    1件目 = 進行方向(bearing(O→D))の右側(+90°)、2件目 = 左側(−90°)。左右は
    「直前の /explore/places 候補分布」のような非決定的な入力を一切使わない、
    決定的な幾何規則(backend-plan.md 決定4)。origin と destination が近すぎる
    (50m 未満)場合は周回を作る余地がないため空を返す。
    """
    base_distance = haversine_meters(origin, destination)
    if base_distance < MIN_LOOP_BASE_DISTANCE_METERS:
        return ()
    base_bearing = bearing_degrees(origin, destination)
    mid = midpoint(origin, destination)
    offset_meters = WAYPOINT_OFFSET_RATIO * base_distance
    right = offset_point(mid, base_bearing + 90.0, offset_meters)
    left = offset_point(mid, base_bearing - 90.0, offset_meters)
    return (right, left)


def path_overlap_ratio(a: Sequence[ProviderPoint], b: Sequence[ProviderPoint]) -> float:
    """往路/復路の折れ線の重複率(20m グリッドにスナップした Jaccard 係数)。

    0=完全に別経路 / 1=同一。両方を `OVERLAP_RESAMPLE_STEP_METERS` 間隔に補間してから
    グリッドへスナップする(スパイクの指標定義と同じ。routes-api-spike.md「指標の定義」)。
    a・b は同じ基準点(anchor)で投影する必要がある(でないと実世界で同じ場所が別セルに
    分かれてしまう)ため、`a` の先頭点を anchor として両方に使う。
    """
    resampled_a = _resample(a, OVERLAP_RESAMPLE_STEP_METERS)
    resampled_b = _resample(b, OVERLAP_RESAMPLE_STEP_METERS)
    if not resampled_a and not resampled_b:
        return 1.0
    anchor = (resampled_a or resampled_b)[0]
    cells_a = _grid_cells(resampled_a, anchor)
    cells_b = _grid_cells(resampled_b, anchor)
    union = cells_a | cells_b
    if not union:
        return 0.0
    intersection = cells_a & cells_b
    return len(intersection) / len(union)


def evaluate_loop(outbound: ProviderRouteLeg, inbound: ProviderRouteLeg) -> LoopVerdict:
    """往路/復路の2 leg をまとめて評価する。3指標のどれか1つでも外れたら不採用。"""
    if outbound.duration_seconds > 0:
        return_to_outbound_ratio = inbound.duration_seconds / outbound.duration_seconds
        total_to_straight_ratio = (outbound.duration_seconds + inbound.duration_seconds) / (
            outbound.duration_seconds * 2
        )
    else:
        # 往路が0秒(Google が異常値を返した)場合、比率は定義できないため常に不採用にする。
        return_to_outbound_ratio = float("inf")
        total_to_straight_ratio = float("inf")
    overlap = path_overlap_ratio(outbound.path, inbound.path)

    failures: list[str] = []
    if return_to_outbound_ratio > MAX_RETURN_TO_OUTBOUND_RATIO:
        failures.append(
            f"return_to_outbound_ratio={return_to_outbound_ratio:.3f}"
            f">{MAX_RETURN_TO_OUTBOUND_RATIO}"
        )
    if total_to_straight_ratio > MAX_TOTAL_TO_STRAIGHT_RATIO:
        failures.append(
            f"total_to_straight_ratio={total_to_straight_ratio:.3f}>{MAX_TOTAL_TO_STRAIGHT_RATIO}"
        )
    if overlap > MAX_PATH_OVERLAP_RATIO:
        failures.append(f"path_overlap_ratio={overlap:.3f}>{MAX_PATH_OVERLAP_RATIO}")

    return LoopVerdict(
        accepted=not failures,
        reason="; ".join(failures) if failures else None,
        return_to_outbound_ratio=return_to_outbound_ratio,
        total_to_straight_ratio=total_to_straight_ratio,
        path_overlap_ratio=overlap,
    )


def _normalize(point: ProviderPoint) -> ProviderPoint:
    """`GeoPoint` の制約(緯度 ±90・経度 ±180)を破らないよう座標を丸める。

    緯度はクランプ(極を超えて折り返さない)、経度は日付変更線をまたいでラップする。
    """
    latitude = max(-90.0, min(90.0, point.latitude))
    longitude = ((point.longitude + 180.0) % 360.0) - 180.0
    return ProviderPoint(latitude=latitude, longitude=longitude)


def _resample(path: Sequence[ProviderPoint], step_meters: float) -> list[ProviderPoint]:
    """折れ線を `step_meters` 間隔の点列に補間し直す(区間ごとの線形補間)。"""
    points = list(path)
    if len(points) < 2:
        return points
    resampled = [points[0]]
    # points と points[1:] は要素数が1つ違う設計(隣接ペアを作るため)なので strict=False。
    for start, end in zip(points, points[1:], strict=False):
        segment_length = haversine_meters(start, end)
        if segment_length <= 0:
            continue
        steps = max(1, round(segment_length / step_meters))
        for step in range(1, steps + 1):
            fraction = step / steps
            resampled.append(
                ProviderPoint(
                    latitude=start.latitude + (end.latitude - start.latitude) * fraction,
                    longitude=start.longitude + (end.longitude - start.longitude) * fraction,
                )
            )
    return resampled


def _grid_cells(points: Sequence[ProviderPoint], anchor: ProviderPoint) -> set[tuple[int, int]]:
    """補間済みの点列を、`anchor` を基準にした 20m グリッドのセル集合へスナップする。"""
    if not points:
        return set()
    cos_anchor_lat = cos(radians(anchor.latitude))
    cells: set[tuple[int, int]] = set()
    for point in points:
        y = radians(point.latitude - anchor.latitude) * EARTH_RADIUS_METERS
        x = radians(point.longitude - anchor.longitude) * EARTH_RADIUS_METERS * cos_anchor_lat
        cells.add((int(x // OVERLAP_GRID_METERS), int(y // OVERLAP_GRID_METERS)))
    return cells

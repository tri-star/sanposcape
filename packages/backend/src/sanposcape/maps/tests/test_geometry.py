import math

import pytest

from sanposcape.integrations.google_maps.provider import ProviderPoint, ProviderRouteLeg
from sanposcape.maps.geometry import (
    MAX_PATH_OVERLAP_RATIO,
    MAX_RETURN_TO_OUTBOUND_RATIO,
    MAX_TOTAL_TO_STRAIGHT_RATIO,
    MIN_LOOP_BASE_DISTANCE_METERS,
    WAYPOINT_OFFSET_RATIO,
    bearing_degrees,
    evaluate_loop,
    haversine_meters,
    loop_waypoint_candidates,
    midpoint,
    offset_point,
    path_overlap_ratio,
)

_EQUATOR_ORIGIN = ProviderPoint(0.0, 0.0)


# --- haversine / bearing: 赤道上の既知値(南北・東西1度の移動量は解析的に求まる) ---


def test_haversine_meters_matches_known_equatorial_degree_distance() -> None:
    # 赤道上での経度1度の弧長は「半径 × 1度(rad)」と厳密に一致する(既知値)。
    east = ProviderPoint(0.0, 1.0)
    assert haversine_meters(_EQUATOR_ORIGIN, east) == pytest.approx(math.radians(1.0) * 6_371_008.8)


def test_haversine_meters_is_symmetric_and_zero_for_identical_points() -> None:
    a, b = ProviderPoint(35.0, 139.0), ProviderPoint(35.1, 139.2)
    assert haversine_meters(a, b) == pytest.approx(haversine_meters(b, a))
    assert haversine_meters(a, a) == pytest.approx(0.0, abs=1e-9)


@pytest.mark.parametrize(
    "destination, expected_bearing",
    [
        (ProviderPoint(1.0, 0.0), 0.0),  # 真北
        (ProviderPoint(0.0, 1.0), 90.0),  # 真東(赤道上は大圏=緯線なので厳密に90度)
        (ProviderPoint(-1.0, 0.0), 180.0),  # 真南
        (ProviderPoint(0.0, -1.0), 270.0),  # 真西
    ],
)
def test_bearing_degrees_known_cardinal_directions(
    destination: ProviderPoint, expected_bearing: float
) -> None:
    assert bearing_degrees(_EQUATOR_ORIGIN, destination) == pytest.approx(
        expected_bearing, abs=1e-6
    )


# --- loop_waypoint_candidates: 決定4 の幾何規則 ---


def test_loop_waypoint_candidates_are_offset_from_midpoint_by_alpha_times_distance() -> None:
    origin = ProviderPoint(35.6812, 139.7671)
    destination = ProviderPoint(35.69, 139.78)

    right, left = loop_waypoint_candidates(origin, destination)

    base_distance = haversine_meters(origin, destination)
    mid = midpoint(origin, destination)
    expected_offset = WAYPOINT_OFFSET_RATIO * base_distance
    assert haversine_meters(mid, right) == pytest.approx(expected_offset, rel=1e-6)
    assert haversine_meters(mid, left) == pytest.approx(expected_offset, rel=1e-6)


def test_loop_waypoint_candidates_are_on_opposite_sides_of_the_straight_line() -> None:
    origin = ProviderPoint(35.6812, 139.7671)
    destination = ProviderPoint(35.69, 139.78)
    base_bearing = bearing_degrees(origin, destination)
    mid = midpoint(origin, destination)

    right, left = loop_waypoint_candidates(origin, destination)

    # 1件目=進行方向の右(+90°)、2件目=左(-90°)。
    assert bearing_degrees(mid, right) == pytest.approx((base_bearing + 90.0) % 360.0, abs=1e-6)
    assert bearing_degrees(mid, left) == pytest.approx((base_bearing - 90.0) % 360.0, abs=1e-6)


def test_loop_waypoint_candidates_are_deterministic_for_the_same_input() -> None:
    origin = ProviderPoint(35.6812, 139.7671)
    destination = ProviderPoint(35.69, 139.78)

    first = loop_waypoint_candidates(origin, destination)
    second = loop_waypoint_candidates(origin, destination)

    assert first == second


def test_loop_waypoint_candidates_empty_when_origin_and_destination_are_too_close() -> None:
    origin = ProviderPoint(35.6812, 139.7671)
    # MIN_LOOP_BASE_DISTANCE_METERS(50m)未満のオフセット(約 5.5m)。
    destination = ProviderPoint(35.68125, 139.7671)
    assert haversine_meters(origin, destination) < MIN_LOOP_BASE_DISTANCE_METERS

    assert loop_waypoint_candidates(origin, destination) == ()


def test_loop_waypoint_candidates_empty_for_identical_points() -> None:
    origin = ProviderPoint(35.6812, 139.7671)
    assert loop_waypoint_candidates(origin, origin) == ()


# --- 極付近・日付変更線付近: GeoPoint の制約(緯度±90・経度±180)を破らないこと ---


def test_offset_point_stays_within_geo_point_bounds_near_the_pole() -> None:
    near_pole = ProviderPoint(89.999, 10.0)
    result = offset_point(near_pole, bearing=0.0, meters=50_000)

    assert -90.0 <= result.latitude <= 90.0
    assert -180.0 <= result.longitude <= 180.0


def test_offset_point_wraps_longitude_across_the_date_line() -> None:
    near_date_line = ProviderPoint(0.0, 179.999)
    result = offset_point(near_date_line, bearing=90.0, meters=50_000)

    assert -180.0 <= result.longitude <= 180.0
    # 東へ進んで日付変更線をまたぐと、経度は正から負へラップする。
    assert result.longitude < 0.0


def test_loop_waypoint_candidates_stay_within_geo_point_bounds_near_the_pole() -> None:
    origin = ProviderPoint(89.9999, 179.9999)
    destination = ProviderPoint(89.998, -179.999)

    for point in loop_waypoint_candidates(origin, destination):
        assert -90.0 <= point.latitude <= 90.0
        assert -180.0 <= point.longitude <= 180.0


# --- path_overlap_ratio ---


def test_path_overlap_ratio_is_one_for_identical_paths() -> None:
    path = (
        ProviderPoint(35.0, 139.0),
        ProviderPoint(35.001, 139.001),
        ProviderPoint(35.002, 139.0),
    )
    assert path_overlap_ratio(path, path) == pytest.approx(1.0)


def test_path_overlap_ratio_is_zero_for_far_apart_paths() -> None:
    a = (ProviderPoint(35.0, 139.0), ProviderPoint(35.001, 139.001))
    # 20mグリッド・10m補間に対して十分離れた(数km)経路。
    b = (ProviderPoint(36.0, 140.0), ProviderPoint(36.001, 140.001))
    assert path_overlap_ratio(a, b) == pytest.approx(0.0)


def test_path_overlap_ratio_is_between_bounds_for_partially_shared_paths() -> None:
    shared_start = ProviderPoint(35.0, 139.0)
    shared_end = ProviderPoint(35.0, 139.004)  # 共有区間: 約370m
    a = (shared_start, shared_end, ProviderPoint(35.004, 139.004))  # 分岐後: 北へ約440m
    b = (shared_start, shared_end, ProviderPoint(35.0, 139.008))  # 分岐後: 東へ約440m

    ratio = path_overlap_ratio(a, b)

    assert 0.0 < ratio < 1.0


# --- evaluate_loop: 3しきい値それぞれの境界 ---

_NON_OVERLAPPING_OUTBOUND_PATH = (ProviderPoint(35.0, 139.0), ProviderPoint(35.01, 139.0))
_NON_OVERLAPPING_INBOUND_PATH = (ProviderPoint(35.0, 139.0), ProviderPoint(35.0, 139.02))


def _leg(duration_seconds: int, path=_NON_OVERLAPPING_OUTBOUND_PATH) -> ProviderRouteLeg:
    return ProviderRouteLeg(duration_seconds=duration_seconds, distance_meters=1, path=path)


def test_evaluate_loop_accepts_when_all_metrics_are_within_thresholds() -> None:
    outbound = _leg(300, _NON_OVERLAPPING_OUTBOUND_PATH)
    inbound = _leg(360, _NON_OVERLAPPING_INBOUND_PATH)  # ret比=1.2

    verdict = evaluate_loop(outbound, inbound)

    assert verdict.accepted is True
    assert verdict.reason is None
    assert verdict.return_to_outbound_ratio == pytest.approx(1.2)
    assert verdict.total_to_straight_ratio == pytest.approx(1.1)
    # 起点(目的地)を1点だけ共有するので厳密に0ではないが、ほぼ重複しない。
    assert verdict.path_overlap_ratio < 0.05


def test_evaluate_loop_accepts_at_the_exact_return_to_outbound_and_total_boundary() -> None:
    """2026-08-22 スパイクの最悪ケース(若葉台〜鶴川 486m 相当・ret比1.796)を模した
    「ぎりぎり通す」値。

    total_to_straight_ratio = (1 + return_to_outbound_ratio) / 2 という関係になるため
    (Σlegs を採用しているため:決定3)、MAX_RETURN_TO_OUTBOUND_RATIO(1.8)ちょうどのとき
    MAX_TOTAL_TO_STRAIGHT_RATIO(1.4)もちょうど境界になる。
    """
    outbound = _leg(300, _NON_OVERLAPPING_OUTBOUND_PATH)
    inbound = _leg(540, _NON_OVERLAPPING_INBOUND_PATH)  # ret比 = 1.8 ちょうど

    verdict = evaluate_loop(outbound, inbound)

    assert verdict.return_to_outbound_ratio == pytest.approx(MAX_RETURN_TO_OUTBOUND_RATIO)
    assert verdict.total_to_straight_ratio == pytest.approx(MAX_TOTAL_TO_STRAIGHT_RATIO)
    assert verdict.accepted is True  # しきい値は超過(>)のみ不採用。境界値自体は通す。


def test_evaluate_loop_rejects_just_beyond_the_return_to_outbound_boundary() -> None:
    outbound = _leg(300, _NON_OVERLAPPING_OUTBOUND_PATH)
    inbound = _leg(541, _NON_OVERLAPPING_INBOUND_PATH)  # ret比 ≈ 1.803 > 1.8

    verdict = evaluate_loop(outbound, inbound)

    assert verdict.accepted is False
    assert verdict.reason is not None
    assert "return_to_outbound_ratio" in verdict.reason
    assert "total_to_straight_ratio" in verdict.reason


def test_evaluate_loop_rejects_when_outbound_duration_is_not_positive() -> None:
    """往路0秒(異常値)は比率が定義できないため常に不採用にする(ZeroDivisionError にしない)。"""
    outbound = _leg(0, _NON_OVERLAPPING_OUTBOUND_PATH)
    inbound = _leg(10, _NON_OVERLAPPING_INBOUND_PATH)

    verdict = evaluate_loop(outbound, inbound)

    assert verdict.accepted is False
    assert verdict.return_to_outbound_ratio == math.inf
    assert verdict.total_to_straight_ratio == math.inf


def test_evaluate_loop_rejects_when_path_overlap_exceeds_the_threshold() -> None:
    # 往路と全く同じ折れ線 = overlap 1.0 (> 0.6)。時間比は安全な範囲に保つ。
    outbound = _leg(300, _NON_OVERLAPPING_OUTBOUND_PATH)
    inbound = _leg(300, _NON_OVERLAPPING_OUTBOUND_PATH)

    verdict = evaluate_loop(outbound, inbound)

    assert verdict.path_overlap_ratio == pytest.approx(1.0)
    assert verdict.path_overlap_ratio > MAX_PATH_OVERLAP_RATIO
    assert verdict.accepted is False
    assert verdict.reason is not None
    assert "path_overlap_ratio" in verdict.reason


def test_evaluate_loop_accepts_when_path_overlap_is_within_the_threshold() -> None:
    outbound = _leg(300, _NON_OVERLAPPING_OUTBOUND_PATH)
    inbound = _leg(300, _NON_OVERLAPPING_INBOUND_PATH)  # 完全に別経路 = overlap 0.0

    verdict = evaluate_loop(outbound, inbound)

    # 起点(目的地)を1点だけ共有するので厳密に0ではないが、ほぼ重複しない。
    assert verdict.path_overlap_ratio < 0.05
    assert verdict.accepted is True

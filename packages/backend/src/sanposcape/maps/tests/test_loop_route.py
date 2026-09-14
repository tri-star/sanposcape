from dataclasses import replace
from itertools import pairwise

import pytest

from sanposcape.integrations.google_maps.provider import ProviderPoint, ProviderRoute
from sanposcape.maps.geometry import haversine_meters, midpoint, offset_point
from sanposcape.maps.loop_route import (
    MAX_DETOUR_RATIO,
    MAX_RETURN_BACKTRACK_RATIO,
    MAX_RETURN_OVERLAP_RATIO,
    MAX_VIA_SNAP_DISTANCE_METERS,
    MIN_WAYPOINT_OFFSET_METERS,
    LoopEvaluation,
    LoopVerdict,
    evaluate_loop,
    loop_waypoint_candidates,
    select_loop,
)

_ORIGIN = ProviderPoint(35.0, 139.0)
_WALKING_SPEED_METERS_PER_SECOND = 1.25


def _route(path: list[ProviderPoint]) -> ProviderRoute:
    total = sum(haversine_meters(a, b) for a, b in pairwise(path))
    return ProviderRoute(
        duration_seconds=round(total / _WALKING_SPEED_METERS_PER_SECOND),
        distance_meters=round(total),
        path=tuple(path),
    )


def _accepted_verdict(overlap: float, detour: float) -> LoopVerdict:
    return LoopVerdict(
        accepted=True,
        reason="ok",
        detour_ratio=detour,
        return_overlap_ratio=overlap,
        return_backtrack_ratio=0.0,
        via_snap_distance_meters=0.0,
    )


# --- loop_waypoint_candidates ---


def test_loop_waypoint_candidates_right_is_east_left_is_west_for_northward_leg() -> None:
    destination = offset_point(_ORIGIN, 0, 300)
    candidates = loop_waypoint_candidates(_ORIGIN, destination)
    assert [candidate.side for candidate in candidates] == ["right", "left"]
    right, left = candidates
    mid = midpoint(_ORIGIN, destination)
    assert right.via.longitude > mid.longitude
    assert left.via.longitude < mid.longitude
    # 0.25 * 300m = 75m < MIN_WAYPOINT_OFFSET_METERS(80m) なので下限にクランプされる
    assert haversine_meters(mid, right.via) == pytest.approx(MIN_WAYPOINT_OFFSET_METERS, abs=1.0)
    assert haversine_meters(mid, left.via) == pytest.approx(MIN_WAYPOINT_OFFSET_METERS, abs=1.0)


def test_loop_waypoint_candidates_offset_scales_with_distance_above_minimum() -> None:
    destination = offset_point(_ORIGIN, 0, 2000)
    candidates = loop_waypoint_candidates(_ORIGIN, destination)
    mid = midpoint(_ORIGIN, destination)
    for candidate in candidates:
        assert haversine_meters(mid, candidate.via) == pytest.approx(0.25 * 2000, abs=2.0)


def test_loop_waypoint_candidates_respects_minimum_base_distance_boundary() -> None:
    just_under = offset_point(_ORIGIN, 0, 49)
    just_over = offset_point(_ORIGIN, 0, 50)
    assert loop_waypoint_candidates(_ORIGIN, just_under) == ()
    assert len(loop_waypoint_candidates(_ORIGIN, just_over)) == 2


def test_loop_waypoint_candidates_round_via_to_5_decimals() -> None:
    origin = ProviderPoint(35.123456789, 139.123456789)
    destination = offset_point(origin, 10, 400)
    for candidate in loop_waypoint_candidates(origin, destination):
        assert candidate.via.latitude == round(candidate.via.latitude, 5)
        assert candidate.via.longitude == round(candidate.via.longitude, 5)


# --- evaluate_loop ---


def test_evaluate_loop_rejects_return_that_retraces_outbound_path() -> None:
    destination = offset_point(_ORIGIN, 0, 300)
    outbound_path = [
        _ORIGIN,
        offset_point(_ORIGIN, 0, 100),
        offset_point(_ORIGIN, 0, 200),
        destination,
    ]
    outbound = _route(outbound_path)
    inbound = _route(list(reversed(outbound_path)))
    via = midpoint(_ORIGIN, destination)

    verdict = evaluate_loop(outbound, inbound, via, _ORIGIN, destination)

    assert verdict.return_overlap_ratio > MAX_RETURN_OVERLAP_RATIO
    assert verdict.accepted is False
    assert "overlap" in verdict.reason


def test_evaluate_loop_accepts_return_that_is_parallel_and_60m_away() -> None:
    destination = offset_point(_ORIGIN, 0, 300)
    mark_100 = offset_point(_ORIGIN, 0, 100)
    mark_200 = offset_point(_ORIGIN, 0, 200)
    outbound = _route([_ORIGIN, mark_100, mark_200, destination])
    shifted_200 = offset_point(mark_200, 90, 60)
    shifted_100 = offset_point(mark_100, 90, 60)
    inbound = _route([destination, shifted_200, shifted_100, _ORIGIN])

    verdict = evaluate_loop(outbound, inbound, shifted_200, _ORIGIN, destination)

    assert verdict.return_overlap_ratio < MAX_RETURN_OVERLAP_RATIO
    assert verdict.accepted is True


def test_evaluate_loop_rejects_long_return_that_still_retraces_half_of_outbound() -> None:
    """W2 の回帰テスト: 復路が往路より長くても、往路をなぞる部分が半分を超えれば不合格にする
    （単純な Jaccard 係数だと分母が膨らんで見逃す形）。"""
    destination = offset_point(_ORIGIN, 0, 200)
    far_south_of_origin = offset_point(_ORIGIN, 180, 100)
    outbound = _route([_ORIGIN, destination])
    # 復路: D -> O(往路をそのままなぞる) -> さらに O から離れる（往路の1.5倍の長さ）
    inbound = _route([destination, _ORIGIN, far_south_of_origin])
    via = offset_point(_ORIGIN, 90, 80)

    verdict = evaluate_loop(outbound, inbound, via, _ORIGIN, destination)

    assert verdict.return_overlap_ratio > MAX_RETURN_OVERLAP_RATIO
    assert verdict.accepted is False
    assert "overlap" in verdict.reason


def test_evaluate_loop_rejects_return_leg_with_a_dead_end_spur() -> None:
    """W3 の回帰テスト: 行き止まりへの「ひげ」は重複率では検出できないため折り返し率で拾う。"""
    destination = offset_point(_ORIGIN, 0, 300)
    outbound = _route([_ORIGIN, destination])
    spur_base = offset_point(destination, 90, 50)
    spur_tip = offset_point(spur_base, 90, 400)
    inbound = _route([destination, spur_base, spur_tip, spur_base, _ORIGIN])

    verdict = evaluate_loop(outbound, inbound, spur_tip, _ORIGIN, destination)

    assert verdict.return_backtrack_ratio > MAX_RETURN_BACKTRACK_RATIO
    assert verdict.accepted is False
    assert "backtrack" in verdict.reason


def test_evaluate_loop_rejects_via_far_from_return_leg() -> None:
    destination = offset_point(_ORIGIN, 0, 300)
    mark_100 = offset_point(_ORIGIN, 0, 100)
    mark_200 = offset_point(_ORIGIN, 0, 200)
    outbound = _route([_ORIGIN, mark_100, mark_200, destination])
    shifted_200 = offset_point(mark_200, 90, 60)
    shifted_100 = offset_point(mark_100, 90, 60)
    inbound = _route([destination, shifted_200, shifted_100, _ORIGIN])
    far_via = offset_point(midpoint(_ORIGIN, destination), 270, 300)

    verdict = evaluate_loop(outbound, inbound, far_via, _ORIGIN, destination)

    assert verdict.via_snap_distance_meters > MAX_VIA_SNAP_DISTANCE_METERS
    assert verdict.accepted is False
    assert verdict.reason == "snap"


def test_evaluate_loop_overlap_ratio_is_zero_when_route_too_short_for_eligible_cells() -> None:
    """境界: O-D 間の距離が最小(50m超)に近いと、O・D の除外半径(30m)が経路全体を覆い、
    `eligible_cells` が空になる。このとき復路が往路をそのまま逆になぞっていても
    `return_overlap_ratio` は無条件で 0.0（合格側）になる（code-quality review の指摘どおりの
    既知の境界挙動であることを固定する）。"""
    destination = offset_point(_ORIGIN, 0, 51)  # 51m: 除外半径30m x2 > 51m なので全域が対象外になる
    outbound = _route([_ORIGIN, destination])
    inbound = _route([destination, _ORIGIN])  # 往路をそのまま逆順にたどる復路
    via = offset_point(_ORIGIN, 90, 80)

    verdict = evaluate_loop(outbound, inbound, via, _ORIGIN, destination)

    assert verdict.return_overlap_ratio == 0.0


def test_evaluate_loop_scales_resample_step_for_unusually_long_routes(monkeypatch) -> None:
    """SEC-L1 対策: origin/destination の距離に上限が無いため、万一 Google が極端に長い
    経路を返しても resample() の点数が無限に増えないことを固定する。"""
    import sanposcape.maps.geometry as geometry_module

    calls: list[float] = []
    original_resample = geometry_module.resample

    def spying_resample(path, step_meters):
        calls.append(step_meters)
        return original_resample(path, step_meters)

    monkeypatch.setattr("sanposcape.maps.loop_route.resample", spying_resample)

    destination = offset_point(_ORIGIN, 0, 300)
    long_outbound = replace(_route([_ORIGIN, destination]), distance_meters=500_000)
    long_inbound = replace(_route([destination, _ORIGIN]), distance_meters=500_000)

    evaluate_loop(long_outbound, long_inbound, midpoint(_ORIGIN, destination), _ORIGIN, destination)

    assert calls and all(step_meters > 10.0 for step_meters in calls)


def test_evaluate_loop_detour_ratio_boundary() -> None:
    destination = offset_point(_ORIGIN, 0, 300)
    mark_100 = offset_point(_ORIGIN, 0, 100)
    mark_200 = offset_point(_ORIGIN, 0, 200)
    outbound = replace(_route([_ORIGIN, mark_100, mark_200, destination]), duration_seconds=1000)
    shifted_200 = offset_point(mark_200, 90, 60)
    shifted_100 = offset_point(mark_100, 90, 60)
    base_inbound = _route([destination, shifted_200, shifted_100, _ORIGIN])
    # detour_ratio = (out + in) / (2 * out); out=1000 なので in=1800 -> 1.40、in=1820 -> 1.41
    passing_inbound = replace(base_inbound, duration_seconds=1800)
    failing_inbound = replace(base_inbound, duration_seconds=1820)

    passing_verdict = evaluate_loop(outbound, passing_inbound, shifted_200, _ORIGIN, destination)
    failing_verdict = evaluate_loop(outbound, failing_inbound, shifted_200, _ORIGIN, destination)

    assert passing_verdict.detour_ratio == pytest.approx(1.40)
    assert passing_verdict.accepted is True
    assert failing_verdict.detour_ratio == pytest.approx(1.41)
    assert failing_verdict.accepted is False
    assert failing_verdict.reason == "detour"
    assert MAX_DETOUR_RATIO == 1.4  # このテストの前提（しきい値を変えたらここも見直す）


# --- select_loop ---


def _evaluation(side: str, longitude_offset: float, verdict: LoopVerdict) -> LoopEvaluation:
    via = ProviderPoint(0.0, longitude_offset)
    route = ProviderRoute(100, 100, (ProviderPoint(0.0, 0.0), ProviderPoint(0.0, 0.001)))
    return LoopEvaluation(side=side, via=via, outbound=route, inbound=route, verdict=verdict)


def test_select_loop_picks_the_lower_score() -> None:
    right = _evaluation("right", 0.0005, _accepted_verdict(overlap=0.1, detour=1.1))
    left = _evaluation("left", -0.0005, _accepted_verdict(overlap=0.4, detour=1.1))

    assert select_loop((right, left)) is right


def test_select_loop_prefers_right_on_a_tie() -> None:
    right = _evaluation("right", 0.0005, _accepted_verdict(overlap=0.1, detour=1.1))
    tied_left = _evaluation("left", -0.0005, _accepted_verdict(overlap=0.1, detour=1.1))

    assert select_loop((right, tied_left)) is right


def test_select_loop_picks_left_when_it_scores_lower() -> None:
    right = _evaluation("right", 0.0005, _accepted_verdict(overlap=0.1, detour=1.1))
    better_left = _evaluation("left", -0.0005, _accepted_verdict(overlap=0.05, detour=1.1))

    assert select_loop((right, better_left)) is better_left


def test_select_loop_returns_none_when_nothing_is_accepted() -> None:
    rejected_verdict = LoopVerdict(
        accepted=False,
        reason="detour",
        detour_ratio=2.0,
        return_overlap_ratio=0.1,
        return_backtrack_ratio=0.0,
        via_snap_distance_meters=0.0,
    )
    rejected = _evaluation("right", 0.0, rejected_verdict)

    assert select_loop((rejected,)) is None
    assert select_loop(()) is None

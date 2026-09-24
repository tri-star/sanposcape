import pytest

from sanposcape.integrations.google_maps.provider import ProviderPoint
from sanposcape.maps.geometry import (
    bearing_degrees,
    grid_cells,
    haversine_meters,
    midpoint,
    offset_point,
    resample,
)

_TOKYO = ProviderPoint(35.681236, 139.767125)


def _circular_degrees_diff(a: float, b: float) -> float:
    """方位角どうしの差を `[0, 180]` に正規化する（0° と 360° を同一視するため）。"""
    return abs((a - b + 180) % 360 - 180)


def test_haversine_meters_of_identical_points_is_zero() -> None:
    assert haversine_meters(_TOKYO, _TOKYO) == 0.0


@pytest.mark.parametrize(
    "bearing, distance", [(0, 100), (90, 250), (180, 500), (270, 1000), (45, 733)]
)
def test_offset_point_round_trips_through_haversine_and_bearing(
    bearing: float, distance: float
) -> None:
    """offset_point で作った点を haversine/bearing で測り直すと元の入力に戻ること。"""
    destination = offset_point(_TOKYO, bearing, distance)
    assert haversine_meters(_TOKYO, destination) == pytest.approx(distance, abs=0.5)
    assert _circular_degrees_diff(bearing_degrees(_TOKYO, destination), bearing % 360) < 0.01


def test_midpoint_is_equidistant_from_both_ends() -> None:
    destination = offset_point(_TOKYO, 30, 800)
    mid = midpoint(_TOKYO, destination)
    assert haversine_meters(_TOKYO, mid) == pytest.approx(
        haversine_meters(mid, destination), abs=0.5
    )
    assert haversine_meters(_TOKYO, mid) == pytest.approx(
        haversine_meters(_TOKYO, destination) / 2, abs=0.5
    )


def test_offset_point_wraps_longitude_across_date_line() -> None:
    origin = ProviderPoint(35.0, 179.9999)
    destination = offset_point(origin, 90, 5000)
    assert -180.0 <= destination.longitude <= 180.0


def test_resample_includes_start_and_end_points() -> None:
    path = (ProviderPoint(0.0, 0.0), offset_point(ProviderPoint(0.0, 0.0), 0, 95))
    samples = resample(path, 10.0)
    assert samples[0] == path[0]
    assert samples[-1] == path[-1]
    # 0, 10, ..., 90 (10 点) + 95m の終点 = 11 点
    assert len(samples) == 11


def test_resample_short_path_is_returned_unchanged() -> None:
    single_point_path = (ProviderPoint(0.0, 0.0),)
    assert resample(single_point_path, 10.0) == single_point_path


def test_grid_cells_places_anchor_in_its_own_cell() -> None:
    anchor = ProviderPoint(35.0, 139.0)
    assert grid_cells((anchor,), anchor, 20.0) == ((0, 0),)


def test_grid_cells_separates_points_that_are_a_cell_apart() -> None:
    anchor = ProviderPoint(35.0, 139.0)
    north_of_anchor = offset_point(anchor, 0, 25.0)
    cells = grid_cells((anchor, north_of_anchor), anchor, 20.0)
    assert cells[0] != cells[1]

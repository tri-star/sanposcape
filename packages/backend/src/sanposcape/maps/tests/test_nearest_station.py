import pytest

from sanposcape.integrations.google_maps.provider import ProviderPoint
from sanposcape.maps.geometry import offset_point
from sanposcape.maps.nearest_station import (
    NEAREST_STATION_MAX_DISTANCE_METERS,
    TAG_LABEL_MAX_LENGTH,
    Station,
    default_stations,
    find_nearest_station,
    station_tag_label,
)
from sanposcape.sanpo_maps.pins.tag_labels import PIN_TAG_MAX_LENGTH

_ORIGIN = ProviderPoint(35.681236, 139.767125)


def _station(name: str, bearing: float, distance_meters: float) -> Station:
    return Station(name=name, location=offset_point(_ORIGIN, bearing, distance_meters))


def test_find_nearest_station_returns_closest_within_range() -> None:
    """範囲内に複数の駅があると、直線距離が最も近い駅とその距離を返すこと。"""
    stations = (_station("遠い", 0, 1_500), _station("近い", 200, 400), _station("中", 90, 900))

    nearest = find_nearest_station(stations, _ORIGIN)

    assert nearest is not None
    assert nearest.station.name == "近い"
    assert nearest.distance_meters == pytest.approx(400, abs=1)


def test_find_nearest_station_ignores_stations_beyond_range() -> None:
    """3km を超える駅しか無いと None を返し、タグにしないこと
    （課題の「範囲内に駅が無ければ付けない」）。"""
    stations = (_station("遠い", 45, NEAREST_STATION_MAX_DISTANCE_METERS + 50),)

    assert find_nearest_station(stations, _ORIGIN) is None


@pytest.mark.parametrize("bearing", [0, 90, 180, 270, 45])
def test_find_nearest_station_keeps_stations_just_inside_range(bearing: float) -> None:
    """どの方角でも 3km をわずかに下回る駅は、緯度・経度の幅での事前の絞り込みで落ちないこと。"""
    stations = (_station("境界", bearing, NEAREST_STATION_MAX_DISTANCE_METERS - 5),)

    nearest = find_nearest_station(stations, _ORIGIN)

    assert nearest is not None
    assert nearest.station.name == "境界"


def test_default_stations_finds_tokyo_station_near_marunouchi() -> None:
    """同梱のデータを読み込め、丸の内の座標では「東京」が最寄り駅になること。"""
    stations = default_stations()

    nearest = find_nearest_station(stations, _ORIGIN)

    assert len(stations) > 9_000
    assert nearest is not None
    assert nearest.station.name == "東京"
    assert nearest.distance_meters < 300


def test_default_stations_has_no_station_in_open_sea() -> None:
    """駅の無い場所（太平洋の沖合）では None になること。"""
    assert find_nearest_station(default_stations(), ProviderPoint(30.0, 145.0)) is None


@pytest.mark.parametrize(
    "name, expected",
    [
        ("新宿", "新宿駅"),
        ("富山駅", "富山駅"),
        ("広島港（宇品）", "広島港駅"),
        ("元町・中華街", "元町・中華街駅"),
        ("  逗子  葉山 ", "逗子 葉山駅"),
        ("（宇品）", "（宇品）駅"),
    ],
)
def test_station_tag_label_suffixes_station_and_drops_parenthetical(
    name: str, expected: str
) -> None:
    """駅名の末尾の括弧書きを落とし、「駅」で終わらなければ付けること。括弧書きだけの名前は残すこと。"""
    assert station_tag_label(name) == expected


def test_station_tag_label_rejects_too_long_label() -> None:
    """「駅」を付けて上限を超える名前は、切り詰めずに None にすること（別の駅名に見えうるため）。"""
    assert station_tag_label("あ" * TAG_LABEL_MAX_LENGTH) is None
    assert station_tag_label("あ" * (TAG_LABEL_MAX_LENGTH - 1)) == "あ" * 19 + "駅"


def test_tag_label_max_length_matches_pin_tag_max_length() -> None:
    """タグの長さの上限の写しが、ピンのタグの上限と一致していること
    （作ったタグが保存で 422 にならない）。"""
    assert TAG_LABEL_MAX_LENGTH == PIN_TAG_MAX_LENGTH

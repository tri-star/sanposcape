"""ピンの位置の最寄り駅（SS-225）。DB も HTTP も持たない。

駅のデータは国土数値情報「鉄道データ」（国土交通省。CC BY 4.0）を加工して同梱する
（`data/stations.csv`。作り方は `scripts/build_station_data.py`）。Google Places から駅名を
取らないのは、駅名をピンのタグとして DB に残すことになり、Google Maps Platform の規約が
許すキャッシュの範囲を超えるため（ADR-001 SS-212 追補で住所を保存しなかったのと同じ理由）。
"""

import csv
import re
from collections.abc import Sequence
from dataclasses import dataclass
from functools import cache
from math import cos, radians
from pathlib import Path

from sanposcape.integrations.google_maps.provider import ProviderPoint
from sanposcape.maps.geometry import haversine_meters

#: 同梱している駅のデータの出典と版。版を上げたら mobile のライセンス画面の表記も合わせる。
STATION_DATA_SOURCE = "国土数値情報（鉄道データ）N02-24（2024年12月31日時点）"

#: これより遠い駅はタグにしない（SS-225 の課題の例のまま）。
NEAREST_STATION_MAX_DISTANCE_METERS = 3_000

#: ピンのタグの長さの上限（`sanpo_maps/pins/tag_labels.py` の `PIN_TAG_MAX_LENGTH`。ドメインを
#: またいで import しないので値を写し、一致はテストで確かめる）。超える駅名はタグにしない。
TAG_LABEL_MAX_LENGTH = 20

_DEFAULT_DATA_PATH = Path(__file__).resolve().parent / "data" / "stations.csv"
_METERS_PER_DEGREE_LATITUDE = 111_320.0
# 駅名の末尾の括弧書き（`広島港（宇品）`・`西鉄福岡（天神）`）。タグには本体の名前だけを使う。
_TRAILING_PARENTHETICAL_PATTERN = re.compile(r"\s*[（(][^（）()]*[）)]$")
_WHITESPACE_PATTERN = re.compile(r"\s+")


@dataclass(frozen=True)
class Station:
    name: str
    location: ProviderPoint


@dataclass(frozen=True)
class NearestStation:
    station: Station
    distance_meters: float


def load_stations(path: Path = _DEFAULT_DATA_PATH) -> tuple[Station, ...]:
    with path.open(encoding="utf-8", newline="") as file:
        return tuple(
            Station(
                name=row["name"],
                location=ProviderPoint(float(row["latitude"]), float(row["longitude"])),
            )
            for row in csv.DictReader(file)
        )


@cache
def default_stations() -> tuple[Station, ...]:
    """同梱のデータを最初に使うときに1回だけ読む（Lambda の実行環境の間は持ち続ける）。"""
    return load_stations()


def find_nearest_station(
    stations: Sequence[Station],
    point: ProviderPoint,
    *,
    max_distance_meters: float = NEAREST_STATION_MAX_DISTANCE_METERS,
) -> NearestStation | None:
    """`max_distance_meters` 以内で直線距離が最も近い駅。無ければ None。

    全国で1万件弱なので、索引は作らず緯度・経度の幅で先に絞ってから距離を測る。
    """
    latitude_margin = max_distance_meters / _METERS_PER_DEGREE_LATITUDE
    # 経度1度の長さは緯度で縮む。極付近でも幅が発散しないよう、縮み方に下限を置く。
    longitude_margin = latitude_margin / max(cos(radians(point.latitude)), 0.01)
    nearest: NearestStation | None = None
    for station in stations:
        if abs(station.location.latitude - point.latitude) > latitude_margin:
            continue
        if abs(station.location.longitude - point.longitude) > longitude_margin:
            continue
        distance = haversine_meters(point, station.location)
        if distance > max_distance_meters:
            continue
        if nearest is None or distance < nearest.distance_meters:
            nearest = NearestStation(station=station, distance_meters=distance)
    return nearest


def station_tag_label(name: str) -> str | None:
    """駅名からタグの表記を作る（`新宿` → `新宿駅`）。タグにできない名前なら None。

    末尾の括弧書きは落とし、名前が「駅」で終わっていなければ「駅」を付ける（路面電車の
    停留場も同じ扱いにする）。長さが上限を超えるときは、切り詰めると別の駅名に見えうるので付けない。
    """
    base = _WHITESPACE_PATTERN.sub(" ", name.strip())
    base = _TRAILING_PARENTHETICAL_PATTERN.sub("", base) or base
    if not base:
        return None
    label = base if base.endswith("駅") else f"{base}駅"
    if len(label) > TAG_LABEL_MAX_LENGTH:
        return None
    return label

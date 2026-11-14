"""Google の住所の読み取り（Geocoding API v4 の結果、Places の formattedAddress）。

SS-138 / SS-212 の逆ジオコーディングの住所・建物名の取り方と、
SS-267 のピンタブの検索の結果の住所の正規化が共有する。
HTTP の呼び出し・キャッシュは `client.py` が持ち、ここは応答の値だけを扱う純粋な関数にする。
"""

import re
import unicodedata
from typing import Any

from sanposcape.integrations.google_maps.exceptions import GoogleMapsUnavailableError
from sanposcape.integrations.google_maps.provider import ProviderAddress, ProviderPoint

# 住所・建物名の上限（Unicode code point）。応答の契約（`maps/schemas.py`）と揃える。
ADDRESS_MAX_CHARS = 256
# 「日本、〒100-0005 」のような国名と郵便番号の接頭辞（NFKC で半角に揃えた後に当てる）。
_JAPAN_PREFIX = re.compile(r"^日本、\s*")
_POSTAL_CODE_PREFIX = re.compile(r"^〒?\d{3}-\d{4}\s*")
# 番地だけの `premise`（例: `9-1`）。建物名として扱わない。
_NUMBER_ONLY = re.compile(r"^[\d\-]+$")
# NFKC で `-` にならないハイフン・マイナスの類（Google は丁目以下の区切りに U+2212 を使う）。
_DASHES = str.maketrans(dict.fromkeys("\u2010\u2011\u2012\u2212", "-"))
# 住所として粗すぎる結果の種類。これだけで構成される結果（海上の「日本」、「日本 〒400-0241」、
# Plus Code）はピン名に使えないので読み飛ばす。
_COARSE_RESULT_TYPES = frozenset({"plus_code", "country", "postal_code", "political"})
# 駅・停留所の結果。住所の後ろに停留所の名前が付くので、住所に使わない（SS-212）。
_TRANSIT_RESULT_TYPE = "transit_station"


def parse_geocode_results(results: object, point: ProviderPoint) -> ProviderAddress | None:
    """Geocoding API v4 の `results` から、ピンの位置の住所と建物名を取り出す。

    `results` は近い順に並ぶ。Plus Code・国・郵便番号だけの粗い結果（住所の無い場所）と、
    駅・停留所の結果（住所の後ろに「東京駅南口」のような停留所の名前が付く）は読み飛ばし、
    最初の結果を住所にする。住所に建物名・階（`subpremise`）が付いていれば、そこから後ろを
    外す（入居者の施設の結果は「丸の内ビルディング 5階」のように階まで付き、番地の結果は隣の
    建物の名前を付けることがあるため）。
    建物名は `premise` のうち番地ではないもので、範囲（`bounds`）にピンの位置が入る結果から
    最初に見つかったものだけを使う（best-effort。近くの別の建物を拾わないため）。
    いずれも SS-212 で実キーの応答（丸ビル・都庁・横浜市中区の付近など）を見て決めた。
    """
    if not isinstance(results, list):
        raise GoogleMapsUnavailableError()
    for result in results:
        if not isinstance(result, dict):
            raise GoogleMapsUnavailableError()
        types = result.get("types")
        if isinstance(types, list) and (
            set(types) <= _COARSE_RESULT_TYPES or _TRANSIT_RESULT_TYPE in types
        ):
            continue
        formatted = result.get("formattedAddress")
        if not isinstance(formatted, str):
            continue
        address = _strip_building_and_floor(
            normalize_address(formatted), result.get("addressComponents")
        )
        if not address:
            continue
        building_name = _building_name_within(results, point)
        return ProviderAddress(
            address=address[:ADDRESS_MAX_CHARS],
            building_name=building_name[:ADDRESS_MAX_CHARS] if building_name else None,
        )
    return None


def _strip_building_and_floor(address: str, components: object) -> str:
    """住所のうち、その結果の建物名・階（`subpremise`）が始まる位置から後ろを外す。"""
    markers = [
        marker
        for marker in (_building_name(components), _subpremise(components))
        if marker is not None and marker in address
    ]
    if not markers:
        return address
    # 建物名・階は番地の後ろに付くので、後ろから探す（町名などに同じ文字列があっても切らない）。
    return address[: min(address.rindex(marker) for marker in markers)].rstrip()


def _subpremise(components: object) -> str | None:
    """番地ではない `subpremise`（例: `5階`）。"""
    if not isinstance(components, list):
        return None
    for component in components:
        if not isinstance(component, dict):
            continue
        types = component.get("types")
        name = component.get("longText")
        if isinstance(types, list) and "subpremise" in types and isinstance(name, str):
            # 部屋番号のような数字だけの値は番地の一部なので切らない（「5階」のような値だけ）。
            normalized = _normalize_text(name)
            if normalized and not _NUMBER_ONLY.match(normalized):
                return normalized
    return None


def _normalize_text(text: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", text).translate(_DASHES).split())


def normalize_address(formatted: str) -> str:
    """国名・郵便番号の接頭辞を落とし、全角の数字・記号を半角に揃える。"""
    text = _normalize_text(formatted)
    text = _JAPAN_PREFIX.sub("", text)
    return _POSTAL_CODE_PREFIX.sub("", text).strip()


def _building_name(components: object) -> str | None:
    if not isinstance(components, list):
        return None
    for component in components:
        if not isinstance(component, dict):
            continue
        types = component.get("types")
        name = component.get("longText")
        if not isinstance(types, list) or "premise" not in types or not isinstance(name, str):
            continue
        normalized = _normalize_text(name)
        if normalized and not _NUMBER_ONLY.match(normalized):
            return normalized
    return None


def _building_name_within(results: list[Any], point: ProviderPoint) -> str | None:
    """範囲（`bounds`）にピンの位置が入る結果から、最初に見つかった建物名を返す。

    範囲を持たない結果は使わない（その建物の上にピンがあるか確かめられないため）。
    """
    for result in results:
        if not isinstance(result, dict) or not _bounds_contains(result.get("bounds"), point):
            continue
        building_name = _building_name(result.get("addressComponents"))
        if building_name is not None:
            return building_name
    return None


def _bounds_contains(bounds: object, point: ProviderPoint) -> bool:
    if not isinstance(bounds, dict):
        return False
    low = bounds.get("low")
    high = bounds.get("high")
    if not isinstance(low, dict) or not isinstance(high, dict):
        return False
    try:
        south = float(low["latitude"])
        west = float(low["longitude"])
        north = float(high["latitude"])
        east = float(high["longitude"])
    except (KeyError, TypeError, ValueError):
        return False
    # 日付変更線をまたぐ範囲（west > east）は考えない（日本の建物の範囲では起きない）。
    return south <= point.latitude <= north and west <= point.longitude <= east

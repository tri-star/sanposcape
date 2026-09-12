"""ネットワークを一切使わない決定的な Google Maps provider。

Maestro E2E と Google Maps API キーを持たないローカル開発者専用。`MAPS_MODE=fake`
（`ENV=local` / `test` 限定。それ以外は `config.py` の許可リスト検証で起動時に
弾かれる）でのみ `build_google_maps_provider` から選択される。

**決定的であることがこのクラスの契約**: 乱数・時刻・キャッシュ TTL は一切使わない。
将来ここに TTL キャッシュや `random` を持ち込むと E2E の flakiness に化けるため、
値の作り方を変更する際は必ず決定性を保つこと。

**Google が返す形の再現ではない**: カテゴリ推定・営業時間・実在性は一切模していない。
実 API 特有の壊れ方（空応答・polyline 破損など）はここでは再現できないため、この
クラスの存在を理由に `HttpGoogleMapsProvider` 側のテストを削ってはいけない。

`GoogleMapsProvider`（`provider.py`）のプロトコルを構造的に満たす
（`UnconfiguredGoogleMapsProvider` と同様、Protocol を明示継承しない）。
"""

from math import cos, degrees, hypot, radians

from sanposcape.integrations.google_maps.provider import (
    ProviderIntermediate,
    ProviderPlace,
    ProviderPoint,
    ProviderRoute,
    ProviderRouteLeg,
)

_EARTH_RADIUS_METERS = 6_371_008.8
_WALKING_SPEED_METERS_PER_SECOND = 1.25  # 約 4.5 km/h
_PLACE_COUNT = 5
_PLACE_OFFSET_STEP_METERS = 200.0  # 200 / 400 / 600 / 800 / 1000m
_ROUTE_PATH_POINTS = 5
# SS-33: 周回(intermediates あり)の復路 leg の点数。D→V→O の2区間を4分割ずつ(端点共有)
# 補間するため 5 + 5 - 1 = 9 点になる。
_LOOP_RETURN_LEG_POINTS = 9
_LOOP_RETURN_LEG_HALF_STEPS = 4
# 極付近で cos(latitude) がゼロに潰れて経度オフセットが発散するのを防ぐガード。
_MIN_COS_LATITUDE = 1e-6
_SQRT_2 = 2**0.5
_CATEGORY_LABELS = {
    "convenience_store": "テストコンビニ",
    "supermarket": "テストスーパー",
    "retail": "テスト店舗",
    "facility": "テスト施設",
    "park": "テスト公園",
    "station": "テスト駅",
}
_DEFAULT_CATEGORY_LABEL = "テストスポット"


class FakeGoogleMapsProvider:
    """`GoogleMapsProvider` の決定的な fake 実装。外部への通信は一切行わない。"""

    def search_places(
        self,
        origin: ProviderPoint,
        categories: tuple[str, ...],
        limit: int,
        *,
        timeout_seconds: float,
    ) -> tuple[ProviderPlace, ...]:
        """origin から北東 45° 方向へ等間隔に並ぶ候補を最大 `_PLACE_COUNT` 件返す。

        `limit` は返す件数の上限であり下限ではない（`min(limit, _PLACE_COUNT)`）。
        「候補は最低3件返せる設計にすること」という要件は `limit >= 3` であることを
        前提にしており、このメソッド自体はそれを保証しない。呼び出し側（mobile）は
        常に `limit=20` を送ることでこの前提を満たしている。`limit` に 1・2 のような
        小さい値を渡す新しい呼び出し元を追加する場合は、この前提を崩さないこと。

        `timeout_seconds` はプロトコル適合のためだけに受け取り、使わない
        （外部呼び出しが無いので待つ必要がない）。
        """
        if not categories:
            # PlaceSearchRequest.categories は min_length=1 なので実運用では起きないが、
            # categories[i % 0] の ZeroDivisionError を構造的に防ぐ。
            return ()
        count = max(0, min(limit, _PLACE_COUNT))
        places: list[ProviderPlace] = []
        for index in range(count):
            component_meters = (_PLACE_OFFSET_STEP_METERS * (index + 1)) / _SQRT_2
            location = _offset(origin, component_meters, component_meters)
            category = categories[index % len(categories)]
            label = _CATEGORY_LABELS.get(category, _DEFAULT_CATEGORY_LABEL)
            places.append(
                ProviderPlace(
                    id=f"fake-place-{index + 1}",
                    name=f"{label}{index + 1}",
                    category=category,
                    location=location,
                )
            )
        return tuple(places)

    def get_walking_route(
        self,
        origin: ProviderPoint,
        destination: ProviderPoint,
        *,
        timeout_seconds: float,
        intermediates: tuple[ProviderIntermediate, ...] = (),
    ) -> ProviderRoute:
        """2 点間の直線距離から徒歩所要時間を見積もり、等分割した直線経路を返す。

        `intermediates` が空のときは従来どおり origin→destination の直線経路(片道)を返す。
        `via` 経由点付きの `intermediates` があるとき(SS-33 の周回)は、決定的な2 leg
        (往路 O→D・復路 D→V→O)を返す(mobile の E2E が `MAPS_MODE=fake` でも往路/復路の
        描き分けを確認できるようにするため)。乱数・時刻は一切使わない(このモジュールの
        決定性の契約)。

        `timeout_seconds` はプロトコル適合のためだけに受け取り、使わない。
        """
        via_points = tuple(item.point for item in intermediates if item.via)
        stopover_points = tuple(item.point for item in intermediates if not item.via)
        if not via_points or not stopover_points:
            distance = _distance_meters(origin, destination)
            path = tuple(
                _interpolate(origin, destination, step / (_ROUTE_PATH_POINTS - 1))
                for step in range(_ROUTE_PATH_POINTS)
            )
            return ProviderRoute(
                duration_seconds=round(distance / _WALKING_SPEED_METERS_PER_SECOND),
                distance_meters=round(distance),
                path=path,
            )

        stopover = stopover_points[0]
        via = via_points[0]
        outbound_leg = self._loop_leg_from_straight_line(origin, stopover, _ROUTE_PATH_POINTS)
        inbound_path = tuple(
            _interpolate(stopover, via, step / _LOOP_RETURN_LEG_HALF_STEPS)
            for step in range(_LOOP_RETURN_LEG_HALF_STEPS + 1)
        ) + tuple(
            _interpolate(via, origin, step / _LOOP_RETURN_LEG_HALF_STEPS)
            for step in range(1, _LOOP_RETURN_LEG_HALF_STEPS + 1)
        )
        inbound_distance = _distance_meters(stopover, via) + _distance_meters(via, origin)
        inbound_leg = ProviderRouteLeg(
            duration_seconds=round(inbound_distance / _WALKING_SPEED_METERS_PER_SECOND),
            distance_meters=round(inbound_distance),
            path=inbound_path,
        )
        # inbound_path は D→V(5点) + V→O(4点、Dとの重複を除く) = 9点(_LOOP_RETURN_LEG_POINTS)。
        combined_path = outbound_leg.path + inbound_leg.path[1:]
        return ProviderRoute(
            duration_seconds=outbound_leg.duration_seconds + inbound_leg.duration_seconds,
            distance_meters=outbound_leg.distance_meters + inbound_leg.distance_meters,
            path=combined_path,
            legs=(outbound_leg, inbound_leg),
        )

    @staticmethod
    def _loop_leg_from_straight_line(
        start: ProviderPoint, end: ProviderPoint, points: int
    ) -> ProviderRouteLeg:
        distance = _distance_meters(start, end)
        path = tuple(_interpolate(start, end, step / (points - 1)) for step in range(points))
        return ProviderRouteLeg(
            duration_seconds=round(distance / _WALKING_SPEED_METERS_PER_SECOND),
            distance_meters=round(distance),
            path=path,
        )


def _offset(origin: ProviderPoint, north_meters: float, east_meters: float) -> ProviderPoint:
    """origin から北へ `north_meters`、東へ `east_meters` 移動した点を返す。

    日付変更線をまたぐ経路は正しく計算しない（fake の割り切り。equirectangular 近似の限界）。
    """
    latitude = origin.latitude + degrees(north_meters / _EARTH_RADIUS_METERS)
    cos_latitude = max(cos(radians(origin.latitude)), _MIN_COS_LATITUDE)
    longitude = origin.longitude + degrees(east_meters / (_EARTH_RADIUS_METERS * cos_latitude))
    return _clamp(ProviderPoint(latitude=latitude, longitude=longitude))


def _distance_meters(a: ProviderPoint, b: ProviderPoint) -> float:
    """2点間の距離を等距円筒（equirectangular）近似で計算する。

    数 km 以内の距離であれば誤差 0.1% 未満で、平方根 1 回の計算で済み決定的。
    日付変更線をまたぐ経路は正しく計算しない（fake の割り切り）。
    """
    mean_latitude = radians((a.latitude + b.latitude) / 2)
    x = radians(b.longitude - a.longitude) * cos(mean_latitude)
    y = radians(b.latitude - a.latitude)
    return _EARTH_RADIUS_METERS * hypot(x, y)


def _interpolate(
    origin: ProviderPoint, destination: ProviderPoint, fraction: float
) -> ProviderPoint:
    """origin → destination の線形補間点（`fraction=0` で origin、`1` で destination）。"""
    return ProviderPoint(
        latitude=origin.latitude + (destination.latitude - origin.latitude) * fraction,
        longitude=origin.longitude + (destination.longitude - origin.longitude) * fraction,
    )


def _clamp(point: ProviderPoint) -> ProviderPoint:
    """`GeoPoint` の `ge`/`le` 制約（緯度 ±90・経度 ±180）を破らないよう座標を丸める。"""
    return ProviderPoint(
        latitude=max(-90.0, min(90.0, point.latitude)),
        longitude=max(-180.0, min(180.0, point.longitude)),
    )

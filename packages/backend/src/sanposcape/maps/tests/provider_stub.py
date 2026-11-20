"""テスト用の `GoogleMapsProvider` の土台（SS-140）。

テストの Fake は、そのテストが使うメソッドだけを上書きすればよいように、このクラスを継承する。
`GoogleMapsProvider`（Protocol）のメソッドをすべて持たせることで、mypy が Fake を
`MapsService` に渡すところで Protocol への適合を検査できる（メソッドが欠けた Fake は
`GoogleMapsProvider` を満たさない）。Protocol にメソッドを足したら、ここにも足す。

上書きしていないメソッドが呼ばれたら、テストの前提の誤りなので `AssertionError` で落とす。
"""

from sanposcape.integrations.google_maps.provider import (
    ProviderAddress,
    ProviderCircle,
    ProviderLoopRoute,
    ProviderPlace,
    ProviderPoint,
    ProviderRectangle,
    ProviderRoute,
    ProviderTextPlace,
)


class GoogleMapsProviderStub:
    def search_places(
        self,
        origin: ProviderPoint,
        categories: tuple[str, ...],
        limit: int,
        *,
        timeout_seconds: float,
    ) -> tuple[ProviderPlace, ...]:
        raise AssertionError("search_places is not stubbed in this test")

    def get_walking_route(
        self, origin: ProviderPoint, destination: ProviderPoint, *, timeout_seconds: float
    ) -> ProviderRoute:
        raise AssertionError("get_walking_route is not stubbed in this test")

    def get_walking_loop_route(
        self,
        origin: ProviderPoint,
        destination: ProviderPoint,
        via: ProviderPoint,
        *,
        timeout_seconds: float,
    ) -> ProviderLoopRoute:
        raise AssertionError("get_walking_loop_route is not stubbed in this test")

    def search_text(
        self,
        query: str,
        *,
        restriction: ProviderRectangle | None,
        bias: ProviderCircle | None,
        limit: int,
        timeout_seconds: float,
    ) -> tuple[ProviderTextPlace, ...]:
        raise AssertionError("search_text is not stubbed in this test")

    def reverse_geocode(
        self, point: ProviderPoint, *, cache_scope: str, timeout_seconds: float
    ) -> ProviderAddress | None:
        raise AssertionError("reverse_geocode is not stubbed in this test")

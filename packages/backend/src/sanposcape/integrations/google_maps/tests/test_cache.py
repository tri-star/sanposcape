from concurrent.futures import ThreadPoolExecutor
from threading import Event, Lock

from sanposcape.integrations.google_maps.cache import SingleFlight, TtlCache


def test_ttl_cache_is_safe_for_concurrent_get_and_put() -> None:
    cache: TtlCache[int] = TtlCache(ttl_seconds=60, max_entries=16)

    def update(index: int) -> None:
        cache.put(f"key-{index % 8}", index)
        cache.get(f"key-{(index + 1) % 8}")

    with ThreadPoolExecutor(max_workers=8) as executor:
        list(executor.map(update, range(200)))


def test_single_flight_coalesces_concurrent_misses() -> None:
    flight: SingleFlight[str] = SingleFlight()
    started = Event()
    release = Event()
    calls = 0
    lock = Lock()

    def load() -> str:
        nonlocal calls
        with lock:
            calls += 1
        started.set()
        release.wait(timeout=1)
        return "normalized-result"

    with ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(lambda: flight.do("same-key", load))
        assert started.wait(timeout=1)
        second = executor.submit(lambda: flight.do("same-key", load))
        release.set()
        assert first.result() == second.result() == "normalized-result"
    assert calls == 1


def test_ttl_cache_purges_expired_entries_of_other_keys(monkeypatch) -> None:
    """期限を過ぎた項目は、別のキーの get / put でも消えること（同じキーで引かれるまで残すと、
    キーに入る検索語・座標が TTL を過ぎてもメモリに残る。
    SS-267 のレビュー対応・データ取扱い台帳 3.1）。"""
    now = [0.0]
    monkeypatch.setattr("sanposcape.integrations.google_maps.cache.monotonic", lambda: now[0])
    cache: TtlCache[int] = TtlCache(ttl_seconds=300, max_entries=16)
    cache.put("text:area:20:東京都千代田区丸の内9-9-9", 1)

    now[0] = 301.0
    assert cache.get("other") is None
    assert "text:area:20:東京都千代田区丸の内9-9-9" not in cache._entries

    cache.put("first", 1)
    now[0] = 700.0
    cache.put("second", 2)
    assert list(cache._entries) == ["second"]


def test_ttl_cache_keeps_live_entries_and_lru_order(monkeypatch) -> None:
    """期限内の項目は消さず、使った順（LRU）の押し出しも変わらないこと。"""
    now = [0.0]
    monkeypatch.setattr("sanposcape.integrations.google_maps.cache.monotonic", lambda: now[0])
    cache: TtlCache[int] = TtlCache(ttl_seconds=300, max_entries=2)
    cache.put("a", 1)
    cache.put("b", 2)
    now[0] = 100.0
    assert cache.get("a") == 1
    cache.put("c", 3)

    assert list(cache._entries) == ["a", "c"]

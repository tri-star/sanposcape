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

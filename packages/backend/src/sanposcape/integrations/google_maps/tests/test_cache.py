from concurrent.futures import ThreadPoolExecutor
from threading import Event, Lock

from sanposcape.integrations.google_maps.cache import SingleFlight


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

from collections import defaultdict, deque
from threading import Lock
from time import monotonic


class ExploreRateLimiter:
    """Per-process all-or-nothing limiter for both authenticated user and source IP buckets."""

    def __init__(self, max_requests: int, window_seconds: int) -> None:
        self._max_requests = max_requests
        self._window_seconds = window_seconds
        self._lock = Lock()
        self._buckets: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, *, user_id: str, client_ip: str) -> bool:
        now = monotonic()
        keys = (f"user:{user_id}", f"ip:{client_ip}")
        with self._lock:
            for key in keys:
                bucket = self._buckets[key]
                while bucket and bucket[0] <= now - self._window_seconds:
                    bucket.popleft()
                if len(bucket) >= self._max_requests:
                    return False
            for key in keys:
                self._buckets[key].append(now)
        return True

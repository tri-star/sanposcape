from collections import defaultdict, deque
from threading import Lock
from time import monotonic


class ExploreRateLimiter:
    """認証状態ごとの process-local な探索 API レート制限。"""

    def __init__(self, max_requests: int, anonymous_max_requests: int, window_seconds: int) -> None:
        self._max_requests = max_requests
        self._anonymous_max_requests = anonymous_max_requests
        self._window_seconds = window_seconds
        self._lock = Lock()
        self._buckets: dict[str, deque[float]] = defaultdict(deque)

    def allow(self, *, user_id: str | None, client_ip: str) -> bool:
        now = monotonic()
        if user_id is None:
            bucket_limits = ((f"anonymous-ip:{client_ip}", self._anonymous_max_requests),)
        else:
            bucket_limits = (
                (f"user:{user_id}", self._max_requests),
                (f"authenticated-ip:{client_ip}", self._max_requests),
            )
        with self._lock:
            for key, limit in bucket_limits:
                bucket = self._buckets[key]
                while bucket and bucket[0] <= now - self._window_seconds:
                    bucket.popleft()
                if len(bucket) >= limit:
                    return False
            for key, _ in bucket_limits:
                self._buckets[key].append(now)
        return True

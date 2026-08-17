from collections import deque
from threading import Lock
from time import monotonic


class ExploreRateLimiter:
    """認証状態ごとの process-local な探索 API レート制限。"""

    # 公開エンドポイントへの単発アクセスでキーが増え続けないようにする。これは
    # process-local limiter のメモリ上限であり、設定値として公開しない。
    _MAX_BUCKETS = 1_024

    def __init__(self, max_requests: int, anonymous_max_requests: int, window_seconds: int) -> None:
        self._max_requests = max_requests
        self._anonymous_max_requests = anonymous_max_requests
        self._window_seconds = window_seconds
        self._lock = Lock()
        self._buckets: dict[str, deque[float]] = {}

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
            self._remove_expired_buckets(now)
            for key, limit in bucket_limits:
                bucket = self._buckets.get(key)
                if bucket is not None and len(bucket) >= limit:
                    return False

            new_bucket_count = sum(key not in self._buckets for key, _ in bucket_limits)
            if len(self._buckets) + new_bucket_count > self._MAX_BUCKETS:
                # 未期限切れの履歴を捨てると、上限到達を誘発した後に同一キーで
                # 追加リクエストできてしまう。既存バケットを保持して新規キーだけ拒否する。
                return False
            for key, _ in bucket_limits:
                self._buckets.setdefault(key, deque()).append(now)
        return True

    def _remove_expired_buckets(self, now: float) -> None:
        """全バケットを清掃し、期限切れで空になったキーも削除する。"""
        expires_at = now - self._window_seconds
        for key, bucket in list(self._buckets.items()):
            while bucket and bucket[0] <= expires_at:
                bucket.popleft()
            if not bucket:
                del self._buckets[key]

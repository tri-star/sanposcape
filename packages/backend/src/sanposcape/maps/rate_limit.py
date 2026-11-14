from collections import deque
from threading import Lock
from time import monotonic


class ExploreRateLimiter:
    """認証状態ごとの process-local なレート制限。

    探索 API・招待・散歩の保存で、それぞれ別のインスタンスを使う（`main._lifespan`）。
    """

    # 公開エンドポイントへの単発アクセスでキーが増え続けないようにする。これは
    # process-local limiter のメモリ上限であり、設定値として公開しない。
    _MAX_BUCKETS = 1_024

    def __init__(
        self,
        max_requests: int,
        anonymous_max_requests: int,
        window_seconds: int,
        *,
        limit_authenticated_ip: bool = True,
    ) -> None:
        """``limit_authenticated_ip=False`` なら、認証済みのリクエストはユーザーの枠だけで数える。

        キーにしている接続元 IP は CloudFront 経由では利用者の IP ではない疑いがあり
        （ADR-005 SS-183 追補、SS-186）、IP の枠を共有した利用者に誤った 429 が出うる。
        認証必須で、誤った 429 を避けたい API（散歩の保存。SS-38）はこちらを使う。
        """
        self._max_requests = max_requests
        self._anonymous_max_requests = anonymous_max_requests
        self._window_seconds = window_seconds
        self._limit_authenticated_ip = limit_authenticated_ip
        self._lock = Lock()
        self._buckets: dict[str, deque[float]] = {}

    def allow(self, *, user_id: str | None, client_ip: str) -> bool:
        now = monotonic()
        if user_id is None:
            bucket_limits = ((f"anonymous-ip:{client_ip}", self._anonymous_max_requests),)
        elif self._limit_authenticated_ip:
            bucket_limits = (
                (f"user:{user_id}", self._max_requests),
                (f"authenticated-ip:{client_ip}", self._max_requests),
            )
        else:
            bucket_limits = ((f"user:{user_id}", self._max_requests),)
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

from collections import OrderedDict
from collections.abc import Callable
from concurrent.futures import Future
from dataclasses import dataclass
from threading import Lock
from time import monotonic


@dataclass
class _CacheEntry[T]:
    expires_at: float
    value: T


class TtlCache[T]:
    """Small process-local cache. Only normalized successful values are stored.

    期限切れの項目は、`get` / `put` のたびにまとめて消す（SS-267）。同じキーで引かれるまで残すと、
    キーに入る検索語・座標が TTL を過ぎてもメモリに残り続けるため
    （データ取扱い台帳 3.1 の保持の書き方）。
    呼び出しが無い間は、実行環境が終わるまで残りうる。
    """

    def __init__(self, ttl_seconds: int, max_entries: int) -> None:
        self._ttl_seconds = ttl_seconds
        self._max_entries = max_entries
        self._entries: OrderedDict[str, _CacheEntry[T]] = OrderedDict()
        self._lock = Lock()

    def get(self, key: str) -> T | None:
        with self._lock:
            self._purge_expired(monotonic())
            entry = self._entries.get(key)
            if entry is None:
                return None
            self._entries.move_to_end(key)
            return entry.value

    def put(self, key: str, value: T) -> None:
        if self._max_entries <= 0 or self._ttl_seconds <= 0:
            return
        with self._lock:
            now = monotonic()
            self._purge_expired(now)
            self._entries[key] = _CacheEntry(now + self._ttl_seconds, value)
            self._entries.move_to_end(key)
            while len(self._entries) > self._max_entries:
                self._entries.popitem(last=False)

    def _purge_expired(self, now: float) -> None:
        # 並びは使った順（LRU）で期限の順ではないので全件を見る（max_entries は既定 256）。
        expired = [key for key, entry in self._entries.items() if entry.expires_at <= now]
        for key in expired:
            del self._entries[key]


class SingleFlight[T]:
    """Coalesce concurrent cache misses for the same normalized provider request."""

    def __init__(self) -> None:
        self._lock = Lock()
        self._in_flight: dict[str, Future[T]] = {}

    def do(self, key: str, loader: Callable[[], T]) -> T:
        with self._lock:
            future = self._in_flight.get(key)
            leader = future is None
            if leader:
                future = Future[T]()
                self._in_flight[key] = future
        if not leader:
            return future.result()
        try:
            value = loader()
        except BaseException as exc:
            future.set_exception(exc)
            raise
        else:
            future.set_result(value)
            return value
        finally:
            with self._lock:
                self._in_flight.pop(key, None)

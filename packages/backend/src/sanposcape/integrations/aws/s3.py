"""写真ストレージ（S3）を隔離する取得層（transport 層）。

folder-structure.md の方針（外部 API / SDK は `integrations/` に隔離し、差し替え・モック
しやすいようインターフェースを介して公開する）に従う。`ObjectStorage` が公開する操作は
`pins/` ドメインのユースケース（presigned POST の発行・確定処理での HEAD/GET/Copy/Put/Delete）
に必要な最小集合で、`STORAGE_MODE`（`AUTH_MODE`/`MAPS_MODE`/`FEATURE_FLAG_MODE` と同じ
fail-safe な流儀）で real / fake / unconfigured を切り替える（B-D8）。

boto3 は Lambda の python3.12 管理ランタイム同梱前提で、`pyproject.toml` の
`[dependency-groups] dev` にのみ追加している（zip に含めない。`secrets.py`/`appconfig.py`
と同じ方針）。

S3 側の制約（infra-notes.md / infra-progress.md で確認済み）:

- バケットは `BucketOwnerEnforced`（ACL 無効）。presigned POST の fields に ACL 系
  （`x-amz-acl` 等）を絶対に含めない（含めるとアップロードが失敗する）。
- 暗号化は SSE-S3（デフォルト暗号化）。暗号化ヘッダーもクライアントに送らせない。
- `s3:ListBucket` が実行ロールに無いと、存在しないキーへの HEAD/GET が 404 ではなく
  403 になる。本モジュールは 403 を「ストレージ不調」として 503 側に倒す
  （BK-1 で `ListBucket` を付け忘れると 409 が 503 に化ける、という既知の罠。deployment.md 参照）。
- `client.copy()`（boto3 の managed transfer）は使わない。multipart copy を要求しうり
  境界（SS-107）の許可範囲外になるため、常に `copy_object`（単発の CopyObject）を使う。
"""

import logging
import threading
from dataclasses import dataclass
from typing import Protocol

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from sanposcape.config import Settings

logger = logging.getLogger(__name__)


class ObjectStorageUnavailableError(Exception):
    """ストレージが未構成、または一時的に利用できない（呼び出し元は 503 に変換する）。"""


class ObjectNotFoundError(Exception):
    """指定したキーのオブジェクトが存在しない。"""


class ObjectTooLargeError(Exception):
    """読み取り対象のオブジェクトが `max_bytes` を超えている。"""


@dataclass(frozen=True)
class PresignedUploadForm:
    """presigned POST の応答。`fields` はクライアントが解釈せず、そのまま multipart で送る。"""

    url: str
    fields: dict[str, str]


@dataclass(frozen=True)
class StoredObjectInfo:
    content_length: int
    content_type: str | None


class ObjectStorage(Protocol):
    def create_upload_form(
        self, *, key: str, content_type: str, max_bytes: int, expires_in: int, base_url: str
    ) -> PresignedUploadForm: ...

    def create_download_url(self, *, key: str, expires_in: int, base_url: str) -> str: ...

    def head(self, key: str) -> StoredObjectInfo | None:
        """存在しなければ `None`。ListBucket が無い環境での 403 は
        `ObjectStorageUnavailableError` として送出する（呼び出し元は 503 に変換する）。
        """
        ...

    def get_bytes(self, key: str, *, max_bytes: int) -> bytes:
        """オブジェクト全体を読み取る。`max_bytes` 超過は `ObjectTooLargeError`、
        存在しなければ `ObjectNotFoundError`。
        """
        ...

    def put_bytes(self, key: str, data: bytes, *, content_type: str) -> None: ...

    def copy(self, *, source_key: str, dest_key: str) -> None: ...

    def delete(self, key: str) -> None: ...


class S3ObjectStorage:
    """boto3 による実装。リージョナルエンドポイントを明示し、SigV4 で署名する。"""

    def __init__(
        self,
        *,
        bucket: str,
        region: str,
        connect_timeout: float,
        read_timeout: float,
        client: object | None = None,
    ) -> None:
        self._bucket = bucket
        self._region = region
        # テストが差し替えた Stubber 付きクライアントまで close() しないよう、自分で
        # 作った場合だけ close する（appconfig.py の AppConfigFlagSource と同じ流儀）。
        self._owns_client = client is None
        # region_name のみを渡す（endpoint_url を明示すると、virtual-hosted-style の
        # ホスト名からリージョンが脱落する botocore の挙動を確認済み。region_name だけで
        # `<bucket>.s3.<region>.amazonaws.com` のリージョナルホストが組み立てられる）。
        self._client = client or boto3.client(
            "s3",
            region_name=region,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "virtual"},
                connect_timeout=connect_timeout,
                read_timeout=read_timeout,
                # ★ `max_attempts` ではなく `total_max_attempts` を使う（`integrations/aws/
                #   appconfig.py` と同じ罠）。`retries.mode="standard"` の `max_attempts` は
                #   botocore 内部で「初回を除く再試行回数」として扱われ、指定値に + 1 された
                #   ものが実際の合計試行回数になる。`total_max_attempts` は初回を含む合計回数を
                #   そのまま表すので、確定処理の時間予算（`PIN_PHOTO_CONFIRM_DEADLINE_SECONDS`）
                #   に対して1回のS3呼び出しが消費しうる最悪時間を見積もる際はこちらを使う
                #   （合計3回 ×（connect_timeout + read_timeout + バックオフ）が上限になる）。
                retries={"total_max_attempts": 3, "mode": "standard"},
                max_pool_connections=10,
            ),
        )

    def create_upload_form(
        self, *, key: str, content_type: str, max_bytes: int, expires_in: int, base_url: str
    ) -> PresignedUploadForm:
        # ACL・SSE のフィールドは含めない（BucketOwnerEnforced・デフォルト暗号化のため）。
        # success_action_status も指定しない（S3 既定の 204。B-D9）。
        try:
            response = self._client.generate_presigned_post(
                Bucket=self._bucket,
                Key=key,
                Fields={"Content-Type": content_type},
                Conditions=[
                    {"Content-Type": content_type},
                    ["content-length-range", 1, max_bytes],
                ],
                ExpiresIn=expires_in,
            )
        except (ClientError, BotoCoreError) as exc:
            raise self._unavailable(exc) from exc
        return PresignedUploadForm(url=response["url"], fields=dict(response["fields"]))

    def create_download_url(self, *, key: str, expires_in: int, base_url: str) -> str:
        try:
            return self._client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self._bucket, "Key": key},
                ExpiresIn=expires_in,
            )
        except (ClientError, BotoCoreError) as exc:
            raise self._unavailable(exc) from exc

    def head(self, key: str) -> StoredObjectInfo | None:
        try:
            response = self._client.head_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            error_code = self._error_code(exc)
            if error_code in ("404", "NoSuchKey"):
                return None
            # 403 は「存在しない可能性」と「ListBucket 不足」を区別できないため、
            # 安全側（503）に倒す（BK-1 の deployment.md 注記）。
            raise self._unavailable(exc) from exc
        except BotoCoreError as exc:
            raise self._unavailable(exc) from exc
        return StoredObjectInfo(
            content_length=int(response.get("ContentLength", 0)),
            content_type=response.get("ContentType"),
        )

    def get_bytes(self, key: str, *, max_bytes: int) -> bytes:
        try:
            response = self._client.get_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            error_code = self._error_code(exc)
            if error_code in ("404", "NoSuchKey"):
                raise ObjectNotFoundError(key) from exc
            raise self._unavailable(exc) from exc
        except BotoCoreError as exc:
            raise self._unavailable(exc) from exc
        content_length = int(response.get("ContentLength", 0))
        if content_length > max_bytes:
            # ボディを読まずに打ち切る（10 MiB を超えるものをメモリに載せない）。
            raise ObjectTooLargeError(key)
        body = response["Body"].read(max_bytes + 1)
        if len(body) > max_bytes:
            raise ObjectTooLargeError(key)
        return body

    def put_bytes(self, key: str, data: bytes, *, content_type: str) -> None:
        try:
            self._client.put_object(
                Bucket=self._bucket, Key=key, Body=data, ContentType=content_type
            )
        except (ClientError, BotoCoreError) as exc:
            raise self._unavailable(exc) from exc

    def copy(self, *, source_key: str, dest_key: str) -> None:
        try:
            self._client.copy_object(
                Bucket=self._bucket,
                Key=dest_key,
                CopySource={"Bucket": self._bucket, "Key": source_key},
            )
        except (ClientError, BotoCoreError) as exc:
            raise self._unavailable(exc) from exc

    def delete(self, key: str) -> None:
        try:
            self._client.delete_object(Bucket=self._bucket, Key=key)
        except (ClientError, BotoCoreError) as exc:
            raise self._unavailable(exc) from exc

    @staticmethod
    def _error_code(exc: ClientError) -> str:
        return exc.response.get("Error", {}).get("Code", "")

    @staticmethod
    def _unavailable(exc: Exception) -> ObjectStorageUnavailableError:
        logger.error("S3 operation failed: %s", type(exc).__name__)
        return ObjectStorageUnavailableError(str(exc))

    def close(self) -> None:
        if self._owns_client:
            self._client.close()


class UnconfiguredObjectStorage:
    """バケット未設定時の安全な既定。全メソッドが `ObjectStorageUnavailableError`
    （AWS を一切呼ばない構造的な安全策。`UnconfiguredGoogleMapsProvider` と同じ形）。
    """

    def create_upload_form(
        self, *, key: str, content_type: str, max_bytes: int, expires_in: int, base_url: str
    ) -> PresignedUploadForm:
        raise ObjectStorageUnavailableError("Photo storage is not configured")

    def create_download_url(self, *, key: str, expires_in: int, base_url: str) -> str:
        raise ObjectStorageUnavailableError("Photo storage is not configured")

    def head(self, key: str) -> StoredObjectInfo | None:
        raise ObjectStorageUnavailableError("Photo storage is not configured")

    def get_bytes(self, key: str, *, max_bytes: int) -> bytes:
        raise ObjectStorageUnavailableError("Photo storage is not configured")

    def put_bytes(self, key: str, data: bytes, *, content_type: str) -> None:
        raise ObjectStorageUnavailableError("Photo storage is not configured")

    def copy(self, *, source_key: str, dest_key: str) -> None:
        raise ObjectStorageUnavailableError("Photo storage is not configured")

    def delete(self, key: str) -> None:
        raise ObjectStorageUnavailableError("Photo storage is not configured")


class FakeObjectStorage:
    """`STORAGE_MODE=fake` 用のプロセス内メモリ実装（開発・E2E 用）。

    presigned POST/GET の代わりに backend 自身の `/dev-storage/*`（`pins/dev_storage_router.py`、
    `STORAGE_MODE=fake` のときだけ include される）を指す URL を発行する。署名は HMAC-SHA256
    （`AUTH_JWT_SECRET` を鍵にする。本物の認証トークンとは用途が別だが、ローカル専用の
    改ざん検知としては十分）。

    実際のバイト列の出し入れ（`store_upload` / `read_object`）は dev_storage_router から
    呼ばれる。`ObjectStorage` プロトコルのメソッド（`head`/`get_bytes`/`put_bytes`/`copy`/
    `delete`）は確定処理（`photo_attacher.py`）から直接呼ばれ、S3 実装と同じ挙動をする。
    """

    def __init__(self, *, secret: str, max_total_bytes: int = 512 * 1024 * 1024) -> None:
        self._secret = secret
        self._max_total_bytes = max_total_bytes
        self._lock = threading.Lock()
        self._objects: dict[str, tuple[bytes, str]] = {}
        self._order: list[str] = []

    # --- ObjectStorage プロトコル ---

    def create_upload_form(
        self, *, key: str, content_type: str, max_bytes: int, expires_in: int, base_url: str
    ) -> PresignedUploadForm:
        expires_at = str(_now_epoch() + expires_in)
        signature = self._sign(key, content_type, str(max_bytes), expires_at)
        return PresignedUploadForm(
            url=f"{base_url.rstrip('/')}/dev-storage/uploads",
            fields={
                "key": key,
                "Content-Type": content_type,
                "x-fake-max-bytes": str(max_bytes),
                "x-fake-expires": expires_at,
                "x-fake-signature": signature,
            },
        )

    def create_download_url(self, *, key: str, expires_in: int, base_url: str) -> str:
        expires_at = str(_now_epoch() + expires_in)
        signature = self._sign_download(key, expires_at)
        return (
            f"{base_url.rstrip('/')}/dev-storage/objects/{key}"
            f"?expires={expires_at}&signature={signature}"
        )

    def head(self, key: str) -> StoredObjectInfo | None:
        with self._lock:
            stored = self._objects.get(key)
        if stored is None:
            return None
        data, content_type = stored
        return StoredObjectInfo(content_length=len(data), content_type=content_type)

    def get_bytes(self, key: str, *, max_bytes: int) -> bytes:
        with self._lock:
            stored = self._objects.get(key)
        if stored is None:
            raise ObjectNotFoundError(key)
        data, _content_type = stored
        if len(data) > max_bytes:
            raise ObjectTooLargeError(key)
        return data

    def put_bytes(self, key: str, data: bytes, *, content_type: str) -> None:
        self._store(key, data, content_type)

    def copy(self, *, source_key: str, dest_key: str) -> None:
        with self._lock:
            stored = self._objects.get(source_key)
        if stored is None:
            raise ObjectNotFoundError(source_key)
        data, content_type = stored
        self._store(dest_key, data, content_type)

    def delete(self, key: str) -> None:
        with self._lock:
            self._objects.pop(key, None)
            if key in self._order:
                self._order.remove(key)

    # --- dev_storage_router 専用の検証・出し入れ ---

    def verify_upload_fields(self, fields: dict[str, str]) -> str | None:
        """アップロードの署名・期限を検証する。問題なければ `None`、エラー文言を返す。"""
        required = ("key", "Content-Type", "x-fake-max-bytes", "x-fake-expires", "x-fake-signature")
        if any(name not in fields for name in required):
            return "AccessDenied"
        expected = self._sign(
            fields["key"],
            fields["Content-Type"],
            fields["x-fake-max-bytes"],
            fields["x-fake-expires"],
        )
        if not _constant_time_eq(expected, fields["x-fake-signature"]):
            return "AccessDenied"
        if _now_epoch() > int(fields["x-fake-expires"]):
            return "AccessDenied"
        return None

    def verify_download_signature(self, *, key: str, expires: str, signature: str) -> str | None:
        expected = self._sign_download(key, expires)
        if not _constant_time_eq(expected, signature):
            return "AccessDenied"
        if _now_epoch() > int(expires):
            return "AccessDenied"
        return None

    def store_upload(
        self, *, key: str, content_type: str, data: bytes, max_bytes: int
    ) -> str | None:
        """アップロード本体を保存する。サイズ超過なら `"EntityTooLarge"`、成功なら `None`。"""
        if len(data) > max_bytes:
            return "EntityTooLarge"
        self._store(key, data, content_type)
        return None

    def read_object(self, key: str) -> tuple[bytes, str] | None:
        with self._lock:
            return self._objects.get(key)

    # --- 内部 ---

    def _store(self, key: str, data: bytes, content_type: str) -> None:
        with self._lock:
            if key not in self._objects:
                self._order.append(key)
            self._objects[key] = (data, content_type)
            self._evict_if_needed()

    def _evict_if_needed(self) -> None:
        total = sum(len(data) for data, _ in self._objects.values())
        while total > self._max_total_bytes and self._order:
            oldest_key = self._order.pop(0)
            evicted = self._objects.pop(oldest_key, None)
            if evicted is not None:
                total -= len(evicted[0])

    def _sign(self, key: str, content_type: str, max_bytes: str, expires: str) -> str:
        message = "|".join((key, content_type, max_bytes, expires))
        return _hmac_hex(self._secret, message)

    def _sign_download(self, key: str, expires: str) -> str:
        message = "|".join((key, expires))
        return _hmac_hex(self._secret, message)


def _now_epoch() -> int:
    import time

    return int(time.time())


def _hmac_hex(secret: str, message: str) -> str:
    import hashlib
    import hmac

    return hmac.new(secret.encode("utf-8"), message.encode("utf-8"), hashlib.sha256).hexdigest()


def _constant_time_eq(a: str, b: str) -> bool:
    import hmac

    return hmac.compare_digest(a, b)


def build_object_storage(settings: Settings) -> ObjectStorage:
    """`STORAGE_MODE` / `PIN_PHOTO_BUCKET_NAME` からどの `ObjectStorage` を使うかを決める
    （`build_google_maps_provider()` / `build_flag_document_source()` と同じ順序）。
    """
    if settings.storage_mode == "fake":
        logger.warning("STORAGE_MODE=fake: object storage is an in-process fake.")
        return FakeObjectStorage(secret=settings.auth_jwt_secret)
    if not settings.pin_photo_bucket_name:
        if settings.env in ("local", "test"):
            logger.warning("PIN_PHOTO_BUCKET_NAME is not configured; photo APIs will return 503.")
        else:
            logger.error("PIN_PHOTO_BUCKET_NAME is not configured; photo APIs will return 503.")
        return UnconfiguredObjectStorage()
    return S3ObjectStorage(
        bucket=settings.pin_photo_bucket_name,
        region=settings.pin_photo_bucket_region,
        connect_timeout=settings.object_storage_connect_timeout_seconds,
        read_timeout=settings.object_storage_read_timeout_seconds,
    )

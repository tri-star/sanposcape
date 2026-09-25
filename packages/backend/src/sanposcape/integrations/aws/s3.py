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
import os
import threading
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError

from sanposcape.config import Settings

logger = logging.getLogger(__name__)

#: S3 `DeleteObjects` の1回あたりの最大キー数（S3 の仕様上の上限）。`S3ObjectStorage.
#: delete_many()` のチャンクサイズと、呼び出し側（`pins/service.py`）が best-effort 削除の
#: 締め切りチェックを行う間隔を揃えるために共有する（R4: ハードコードの重複を避ける）。
S3_DELETE_OBJECTS_MAX_KEYS = 1000

#: 削除専用 client（`delete`/`delete_many`）の試行回数。「再試行なし」はユーザー決定で、
#: env にすると呼び出し側（`pins/service.py`）が見積もる「1回の最悪時間」（バックオフを
#: 含めない式）を運用で壊せてしまうため、定数にしている（ADR-009 決定22 追補, SS-112）。
_DELETE_TOTAL_MAX_ATTEMPTS = 1


def _build_s3_client(
    *, region: str, connect_timeout: float, read_timeout: float, total_max_attempts: int
) -> object:
    """S3 client を1つ組み立てる（通常用・削除用で共通の設定をここに集約する）。

    `region_name` のみを渡す（`endpoint_url` を明示すると、virtual-hosted-style の
    ホスト名からリージョンが脱落する botocore の挙動を確認済み。`region_name` だけで
    `<bucket>.s3.<region>.amazonaws.com` のリージョナルホストが組み立てられる）。
    """
    return boto3.client(
        "s3",
        region_name=region,
        config=Config(
            signature_version="s3v4",
            s3={"addressing_style": "virtual"},
            connect_timeout=connect_timeout,
            read_timeout=read_timeout,
            # ★ `max_attempts` ではなく `total_max_attempts` を使う（appconfig.py と同じ罠）。
            #   `retries.mode="standard"` の `max_attempts` は botocore 内部で「初回を除く
            #   再試行回数」として扱われ、指定値に + 1 されたものが実際の合計試行回数になる。
            #   `total_max_attempts` は初回を含む合計回数をそのまま表すので、時間予算
            #   （通常 client なら `PIN_PHOTO_CONFIRM_DEADLINE_SECONDS`、削除用 client なら
            #   `PIN_PHOTO_DELETE_DEADLINE_SECONDS`）に対して1回の S3 呼び出しが消費しうる
            #   最悪時間を見積もる際はこちらを使う。
            retries={"total_max_attempts": total_max_attempts, "mode": "standard"},
            max_pool_connections=10,
        ),
    )


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

    def delete_many(self, keys: list[str]) -> list[str]:
        """複数キーを削除する（ピン削除, ADR-009 決定22）。戻り値は削除に失敗したキー。

        S3 実装は `DeleteObjects`（最大1000件/回）でチャンク処理する。1件ずつの `delete()`
        だと写真が数百枚あるピンの削除で Lambda の時間予算を食い潰しうるため、経路を
        分ける。`ObjectStorageUnavailableError` を送出するのは Unconfigured のときだけで、
        S3 実装は個々のチャンクの失敗を例外にせず戻り値に含める（呼び出し側を単純にする）。
        S3 実装は削除専用の client（再試行なし・短い timeout）で呼ぶため、1回の呼び出しは
        `connect_timeout + read_timeout` 秒で有界になる（ADR-009 決定22 追補, SS-112）。
        """
        ...


class S3ObjectStorage:
    """boto3 による実装。リージョナルエンドポイントを明示し、SigV4 で署名する。"""

    def __init__(
        self,
        *,
        bucket: str,
        region: str,
        connect_timeout: float,
        read_timeout: float,
        delete_connect_timeout: float,
        delete_read_timeout: float,
        client: object | None = None,
        delete_client: object | None = None,
    ) -> None:
        self._bucket = bucket
        self._region = region
        # テストが差し替えた Stubber 付きクライアントまで close() しないよう、自分で
        # 作った場合だけ close する（appconfig.py の AppConfigFlagSource と同じ流儀）。
        self._owns_client = client is None
        self._client = client or _build_s3_client(
            region=region,
            connect_timeout=connect_timeout,
            read_timeout=read_timeout,
            total_max_attempts=3,
        )
        # 削除（`delete`/`delete_many`）専用の client（ADR-009 決定22 追補, SS-112）。
        # 解決規則: (1) `delete_client` が渡されたらそれを使う（所有しない）。
        # (2) 渡されず `client` が渡されたら、同じ `client` を削除にも使う（所有しない。
        #     既存の Stubber テストが変更なしで動くようにするため）。(3) どちらも渡され
        #     なければ、削除専用の Config（再試行なし・短い timeout）で新しく作る（所有する）。
        if delete_client is not None:
            self._delete_client = delete_client
            self._owns_delete_client = False
        elif client is not None:
            self._delete_client = client
            self._owns_delete_client = False
        else:
            self._delete_client = _build_s3_client(
                region=region,
                connect_timeout=delete_connect_timeout,
                read_timeout=delete_read_timeout,
                total_max_attempts=_DELETE_TOTAL_MAX_ATTEMPTS,
            )
            self._owns_delete_client = True

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
            self._delete_client.delete_object(Bucket=self._bucket, Key=key)
        except (ClientError, BotoCoreError) as exc:
            raise self._unavailable(exc) from exc

    def delete_many(self, keys: list[str]) -> list[str]:
        """`DeleteObjects`（`Quiet=True`）を `S3_DELETE_OBJECTS_MAX_KEYS` 件ずつの
        チャンクで呼ぶ。

        削除専用の client（再試行なし・短い timeout）で呼ぶため、1回の呼び出しは
        `delete_connect_timeout + delete_read_timeout` 秒で有界になる（ADR-009 決定22
        追補, SS-112）。チャンク単位で `ClientError`/`BotoCoreError` を捕捉し、そのチャンク
        全体を失敗扱いにしてログを出したうえで次のチャンクへ進む（例外は投げない。
        呼び出し側の締め切り管理を単純にするため, ADR-009 決定22）。
        """
        failed: list[str] = []
        for start in range(0, len(keys), S3_DELETE_OBJECTS_MAX_KEYS):
            chunk = keys[start : start + S3_DELETE_OBJECTS_MAX_KEYS]
            try:
                response = self._delete_client.delete_objects(
                    Bucket=self._bucket,
                    Delete={"Objects": [{"Key": key} for key in chunk], "Quiet": True},
                )
            except (ClientError, BotoCoreError) as exc:
                logger.warning(
                    "S3 delete_objects failed for a chunk of %d keys: %s",
                    len(chunk),
                    type(exc).__name__,
                )
                failed.extend(chunk)
                continue
            failed.extend(error["Key"] for error in response.get("Errors", []))
        return failed

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
        if self._owns_delete_client:
            self._delete_client.close()


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

    def delete_many(self, keys: list[str]) -> list[str]:
        raise ObjectStorageUnavailableError("Photo storage is not configured")


class FakeObjectStorage:
    """`STORAGE_MODE=fake` 用の開発・E2E 用実装。

    presigned POST/GET の代わりに backend 自身の `/dev-storage/*`（`pins/dev_storage_router.py`、
    `STORAGE_MODE=fake` のときだけ include される）を指す URL を発行する。署名は HMAC-SHA256
    （`AUTH_JWT_SECRET` を鍵にする。本物の認証トークンとは用途が別だが、ローカル専用の
    改ざん検知としては十分）。

    保存先は `root_dir` で切り替える:

    - `root_dir=None`（テストの既定）: プロセス内メモリ。`max_total_bytes` を超えたら
      古い順に捨てる。
    - `root_dir` 指定（ローカル開発。`DEV_STORAGE_DIR`）: `<root_dir>/objects/<key>` に本体、
      `<root_dir>/content-types/<key>` に Content-Type を書く。`uvicorn --reload` や
      コンテナ再起動で写真が消え、DB 上のピンだけが残って 404 になるのを防ぐため。
      DB が参照している写真を黙って消さないよう、容量による追い出しは行わない
      （不要になったらディレクトリごと手で消す）。

    実際のバイト列の出し入れ（`store_upload` / `read_object`）は dev_storage_router から
    呼ばれる。`ObjectStorage` プロトコルのメソッド（`head`/`get_bytes`/`put_bytes`/`copy`/
    `delete`）は確定処理（`photo_attacher.py`）から直接呼ばれ、S3 実装と同じ挙動をする。
    """

    def __init__(
        self,
        *,
        secret: str,
        max_total_bytes: int = 512 * 1024 * 1024,
        root_dir: Path | None = None,
    ) -> None:
        self._secret = secret
        self._max_total_bytes = max_total_bytes
        self._lock = threading.Lock()
        self._objects: dict[str, tuple[bytes, str]] = {}
        self._order: list[str] = []
        self._root_dir = root_dir.resolve() if root_dir is not None else None
        if self._root_dir is not None:
            self._root_dir.mkdir(parents=True, exist_ok=True)

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
        stored = self._load(key)
        if stored is None:
            return None
        data, content_type = stored
        return StoredObjectInfo(content_length=len(data), content_type=content_type)

    def get_bytes(self, key: str, *, max_bytes: int) -> bytes:
        stored = self._load(key)
        if stored is None:
            raise ObjectNotFoundError(key)
        data, _content_type = stored
        if len(data) > max_bytes:
            raise ObjectTooLargeError(key)
        return data

    def put_bytes(self, key: str, data: bytes, *, content_type: str) -> None:
        self._store(key, data, content_type)

    def copy(self, *, source_key: str, dest_key: str) -> None:
        stored = self._load(source_key)
        if stored is None:
            raise ObjectNotFoundError(source_key)
        data, content_type = stored
        self._store(dest_key, data, content_type)

    def delete(self, key: str) -> None:
        with self._lock:
            if self._root_dir is not None:
                for path in self._disk_paths(key) or ():
                    path.unlink(missing_ok=True)
                return
            self._objects.pop(key, None)
            if key in self._order:
                self._order.remove(key)

    def delete_many(self, keys: list[str]) -> list[str]:
        """`delete()` をループするだけ（S3 と同じく存在しないキーの削除も成功扱い）。"""
        for key in keys:
            self.delete(key)
        return []

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
        return self._load(key)

    # --- 内部 ---

    def _load(self, key: str) -> tuple[bytes, str] | None:
        with self._lock:
            if self._root_dir is None:
                return self._objects.get(key)
            paths = self._disk_paths(key)
            if paths is None:
                return None
            data_path, content_type_path = paths
            try:
                data = data_path.read_bytes()
            except (FileNotFoundError, IsADirectoryError, NotADirectoryError):
                return None
            try:
                content_type = content_type_path.read_text(encoding="utf-8")
            except FileNotFoundError:
                content_type = "application/octet-stream"
            return data, content_type

    def _store(self, key: str, data: bytes, content_type: str) -> None:
        with self._lock:
            if self._root_dir is not None:
                paths = self._disk_paths(key)
                if paths is None:
                    # 実運用のキーは backend が組み立てる（photo_keys.py）ので起こらない
                    # 防御的チェック。
                    raise ValueError(f"invalid object key: {key!r}")
                data_path, content_type_path = paths
                _atomic_write(content_type_path, content_type.encode("utf-8"))
                _atomic_write(data_path, data)
                return
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

    def _disk_paths(self, key: str) -> tuple[Path, Path] | None:
        """キーに対応する（本体, Content-Type）のパス。`root_dir` の外を指すキーは `None`。

        キーは署名済み（改ざんできない）だが、`..` や絶対パスで `root_dir` の外へ
        読み書きしないよう多重防御として弾く。
        """
        assert self._root_dir is not None
        parts = key.split("/")
        if not key or key.startswith("/") or any(part in ("", ".", "..") for part in parts):
            return None
        return (
            self._root_dir / "objects" / key,
            self._root_dir / "content-types" / key,
        )

    def _sign(self, key: str, content_type: str, max_bytes: str, expires: str) -> str:
        message = "|".join((key, content_type, max_bytes, expires))
        return _hmac_hex(self._secret, message)

    def _sign_download(self, key: str, expires: str) -> str:
        message = "|".join((key, expires))
        return _hmac_hex(self._secret, message)


def _atomic_write(path: Path, data: bytes) -> None:
    """途中で落ちても壊れたファイルを残さないよう、一時ファイル経由で置き換える。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = path.with_name(f".{path.name}.{os.getpid()}.{threading.get_ident()}.tmp")
    tmp_path.write_bytes(data)
    os.replace(tmp_path, path)


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
        root_dir = Path(settings.dev_storage_dir) if settings.dev_storage_dir else None
        logger.warning(
            "STORAGE_MODE=fake: object storage is a local fake (%s).",
            f"disk: {root_dir}" if root_dir is not None else "in-memory",
        )
        return FakeObjectStorage(secret=settings.auth_jwt_secret, root_dir=root_dir)
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
        delete_connect_timeout=settings.object_storage_delete_connect_timeout_seconds,
        delete_read_timeout=settings.object_storage_delete_read_timeout_seconds,
    )

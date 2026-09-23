import base64
import json
from pathlib import Path
from urllib.parse import urlsplit

import boto3
import pytest
from botocore.config import Config
from botocore.stub import Stubber

from sanposcape.config import Settings
from sanposcape.integrations.aws.s3 import (
    FakeObjectStorage,
    ObjectNotFoundError,
    ObjectStorageUnavailableError,
    ObjectTooLargeError,
    S3ObjectStorage,
    UnconfiguredObjectStorage,
    build_object_storage,
)

BUCKET = "sanposcape-dev-pin-photos-111111111111"
REGION = "ap-southeast-1"


def make_storage() -> tuple[S3ObjectStorage, Stubber]:
    # 実装（S3ObjectStorage._client の生成コード）と同じ Config を使う。presigned URL の
    # 形はこの signature_version/addressing_style に依存するため、外部から渡す client
    # でも揃えないとテストが実装と無関係な結果を検証してしまう。
    client = boto3.client(
        "s3",
        region_name=REGION,
        aws_access_key_id="x",
        aws_secret_access_key="y",
        config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
    )
    stubber = Stubber(client)
    storage = S3ObjectStorage(
        bucket=BUCKET, region=REGION, connect_timeout=1, read_timeout=1, client=client
    )
    return storage, stubber


class TestCreateUploadForm:
    def test_generates_regional_url_with_expected_conditions(self) -> None:
        storage, _stubber = make_storage()

        form = storage.create_upload_form(
            key="staging/pins/u1/up1.jpg",
            content_type="image/jpeg",
            max_bytes=10 * 1024 * 1024,
            expires_in=600,
            base_url="https://ignored.example/",
        )

        parsed = urlsplit(form.url)
        assert parsed.hostname == f"{BUCKET}.s3.{REGION}.amazonaws.com"
        assert form.fields["key"] == "staging/pins/u1/up1.jpg"
        assert form.fields["Content-Type"] == "image/jpeg"
        assert "x-amz-acl" not in form.fields
        assert "success_action_status" not in form.fields

        policy = json.loads(base64.b64decode(form.fields["policy"]))
        conditions = policy["conditions"]
        length_range = [1, 10 * 1024 * 1024]
        assert any(
            isinstance(c, list) and c[0] == "content-length-range" and c[1:] == length_range
            for c in conditions
        )
        assert any(
            isinstance(c, dict) and c.get("Content-Type") == "image/jpeg" for c in conditions
        )


class TestCreateDownloadUrl:
    def test_generates_regional_url_with_expiry(self) -> None:
        storage, _stubber = make_storage()

        url = storage.create_download_url(
            key="thumb/pins/u1/up1/512.jpg", expires_in=3600, base_url="https://ignored.example/"
        )

        parsed = urlsplit(url)
        assert parsed.hostname == f"{BUCKET}.s3.{REGION}.amazonaws.com"
        query = dict(part.split("=", 1) for part in parsed.query.split("&"))
        assert query["X-Amz-Expires"] == "3600"


class TestHead:
    def test_returns_info_when_object_exists(self) -> None:
        storage, stubber = make_storage()
        stubber.add_response(
            "head_object",
            {"ContentLength": 123, "ContentType": "image/jpeg"},
            {"Bucket": BUCKET, "Key": "k"},
        )
        with stubber:
            info = storage.head("k")
        assert info is not None
        assert info.content_length == 123
        assert info.content_type == "image/jpeg"

    def test_returns_none_when_missing(self) -> None:
        storage, stubber = make_storage()
        stubber.add_client_error("head_object", service_error_code="404")
        with stubber:
            assert storage.head("missing") is None

    def test_raises_unavailable_on_403(self) -> None:
        storage, stubber = make_storage()
        stubber.add_client_error("head_object", service_error_code="403")
        with stubber, pytest.raises(ObjectStorageUnavailableError):
            storage.head("k")


class TestGetBytes:
    def test_returns_body(self) -> None:
        storage, stubber = make_storage()
        stubber.add_response(
            "get_object",
            {"ContentLength": 3, "Body": _body(b"abc")},
            {"Bucket": BUCKET, "Key": "k"},
        )
        with stubber:
            assert storage.get_bytes("k", max_bytes=10) == b"abc"

    def test_raises_too_large_by_content_length(self) -> None:
        storage, stubber = make_storage()
        stubber.add_response(
            "get_object",
            {"ContentLength": 100, "Body": _body(b"x" * 100)},
            {"Bucket": BUCKET, "Key": "k"},
        )
        with stubber, pytest.raises(ObjectTooLargeError):
            storage.get_bytes("k", max_bytes=10)

    def test_raises_not_found(self) -> None:
        storage, stubber = make_storage()
        stubber.add_client_error("get_object", service_error_code="NoSuchKey")
        with stubber, pytest.raises(ObjectNotFoundError):
            storage.get_bytes("missing", max_bytes=10)


class TestPutBytes:
    def test_calls_put_object(self) -> None:
        storage, stubber = make_storage()
        stubber.add_response(
            "put_object",
            {},
            {"Bucket": BUCKET, "Key": "k", "Body": b"data", "ContentType": "image/jpeg"},
        )
        with stubber:
            storage.put_bytes("k", b"data", content_type="image/jpeg")


class TestCopy:
    def test_uses_copy_object_not_managed_transfer(self) -> None:
        storage, stubber = make_storage()
        stubber.add_response(
            "copy_object",
            {},
            {
                "Bucket": BUCKET,
                "Key": "original/pins/u1/up1.jpg",
                "CopySource": {"Bucket": BUCKET, "Key": "staging/pins/u1/up1.jpg"},
            },
        )
        with stubber:
            storage.copy(source_key="staging/pins/u1/up1.jpg", dest_key="original/pins/u1/up1.jpg")


class TestDelete:
    def test_calls_delete_object(self) -> None:
        storage, stubber = make_storage()
        stubber.add_response("delete_object", {}, {"Bucket": BUCKET, "Key": "k"})
        with stubber:
            storage.delete("k")


class TestFakeObjectStorage:
    def test_upload_and_download_round_trip(self) -> None:
        storage = FakeObjectStorage(secret="s" * 32)
        form = storage.create_upload_form(
            key="staging/pins/u1/up1.jpg",
            content_type="image/jpeg",
            max_bytes=1024,
            expires_in=600,
            base_url="http://localhost:8000/",
        )
        assert storage.verify_upload_fields(form.fields) is None
        assert (
            storage.store_upload(
                key=form.fields["key"], content_type="image/jpeg", data=b"abc", max_bytes=1024
            )
            is None
        )

        download_url = storage.create_download_url(
            key="staging/pins/u1/up1.jpg", expires_in=3600, base_url="http://localhost:8000/"
        )
        query = dict(part.split("=", 1) for part in urlsplit(download_url).query.split("&"))
        assert (
            storage.verify_download_signature(
                key="staging/pins/u1/up1.jpg",
                expires=query["expires"],
                signature=query["signature"],
            )
            is None
        )

    def test_upload_signature_expired(self) -> None:
        storage = FakeObjectStorage(secret="s" * 32)
        form = storage.create_upload_form(
            key="k", content_type="image/jpeg", max_bytes=10, expires_in=-1, base_url="http://x/"
        )
        assert storage.verify_upload_fields(form.fields) == "AccessDenied"

    def test_upload_signature_mismatch(self) -> None:
        storage = FakeObjectStorage(secret="s" * 32)
        form = storage.create_upload_form(
            key="k", content_type="image/jpeg", max_bytes=10, expires_in=600, base_url="http://x/"
        )
        tampered = {**form.fields, "x-fake-signature": "wrong"}
        assert storage.verify_upload_fields(tampered) == "AccessDenied"

    def test_upload_size_over_limit(self) -> None:
        storage = FakeObjectStorage(secret="s" * 32)
        assert (
            storage.store_upload(key="k", content_type="image/jpeg", data=b"x" * 20, max_bytes=10)
            == "EntityTooLarge"
        )

    def test_evicts_oldest_when_over_capacity(self) -> None:
        storage = FakeObjectStorage(secret="s" * 32, max_total_bytes=10)
        storage.put_bytes("a", b"12345", content_type="image/jpeg")
        storage.put_bytes("b", b"12345", content_type="image/jpeg")
        storage.put_bytes("c", b"12345", content_type="image/jpeg")
        assert storage.head("a") is None
        assert storage.head("c") is not None

    def test_object_storage_protocol_methods(self) -> None:
        storage = FakeObjectStorage(secret="s" * 32)
        storage.put_bytes("src", b"data", content_type="image/jpeg")
        storage.copy(source_key="src", dest_key="dst")
        assert storage.get_bytes("dst", max_bytes=10) == b"data"
        with pytest.raises(ObjectTooLargeError):
            storage.get_bytes("dst", max_bytes=1)
        storage.delete("dst")
        with pytest.raises(ObjectNotFoundError):
            storage.get_bytes("dst", max_bytes=10)


class TestFakeObjectStorageOnDisk:
    """`root_dir` 指定時（`DEV_STORAGE_DIR`）はディスクに永続化される。"""

    def test_objects_survive_new_instance(self, tmp_path: Path) -> None:
        storage = FakeObjectStorage(secret="s" * 32, root_dir=tmp_path)
        assert (
            storage.store_upload(
                key="staging/pins/u1/up1.jpg", content_type="image/jpeg", data=b"abc", max_bytes=10
            )
            is None
        )
        storage.copy(source_key="staging/pins/u1/up1.jpg", dest_key="original/pins/u1/p1.jpg")

        # backend の再起動（--reload 含む）を模して別インスタンスで読む
        restarted = FakeObjectStorage(secret="s" * 32, root_dir=tmp_path)
        assert restarted.read_object("original/pins/u1/p1.jpg") == (b"abc", "image/jpeg")
        info = restarted.head("staging/pins/u1/up1.jpg")
        assert info is not None
        assert info.content_length == 3
        assert info.content_type == "image/jpeg"
        assert (tmp_path / "objects" / "original" / "pins" / "u1" / "p1.jpg").read_bytes() == b"abc"

    def test_delete_removes_files(self, tmp_path: Path) -> None:
        storage = FakeObjectStorage(secret="s" * 32, root_dir=tmp_path)
        storage.put_bytes("thumb/a.jpg", b"data", content_type="image/jpeg")
        storage.delete("thumb/a.jpg")
        assert storage.head("thumb/a.jpg") is None
        with pytest.raises(ObjectNotFoundError):
            storage.get_bytes("thumb/a.jpg", max_bytes=10)
        # 存在しないキーの削除は S3 と同じく成功扱い
        storage.delete("thumb/a.jpg")

    def test_does_not_evict_on_disk(self, tmp_path: Path) -> None:
        storage = FakeObjectStorage(secret="s" * 32, max_total_bytes=10, root_dir=tmp_path)
        storage.put_bytes("a", b"12345", content_type="image/jpeg")
        storage.put_bytes("b", b"12345", content_type="image/jpeg")
        storage.put_bytes("c", b"12345", content_type="image/jpeg")
        assert storage.head("a") is not None

    @pytest.mark.parametrize("key", ["../escape.jpg", "a/../../escape.jpg", "/abs.jpg", "a//b", ""])
    def test_rejects_keys_outside_root(self, tmp_path: Path, key: str) -> None:
        root = tmp_path / "root"
        storage = FakeObjectStorage(secret="s" * 32, root_dir=root)
        assert storage.read_object(key) is None
        assert storage.head(key) is None
        with pytest.raises(ValueError, match="invalid object key"):
            storage.put_bytes(key, b"x", content_type="image/jpeg")
        storage.delete(key)
        assert not (tmp_path / "escape.jpg").exists()


class TestBuildObjectStorage:
    def test_fake_mode(self) -> None:
        settings = Settings(env="test", storage_mode="fake", auth_jwt_secret="x" * 32)
        assert isinstance(build_object_storage(settings), FakeObjectStorage)

    def test_fake_mode_persists_to_dev_storage_dir(self, tmp_path: Path) -> None:
        settings = Settings(
            env="test",
            storage_mode="fake",
            auth_jwt_secret="x" * 32,
            dev_storage_dir=str(tmp_path / "dev-storage"),
        )
        storage = build_object_storage(settings)
        assert isinstance(storage, FakeObjectStorage)
        storage.put_bytes("thumb/a.jpg", b"data", content_type="image/jpeg")
        assert (tmp_path / "dev-storage" / "objects" / "thumb" / "a.jpg").read_bytes() == b"data"

    def test_unconfigured_when_bucket_missing(self) -> None:
        settings = Settings(env="test", storage_mode="real", pin_photo_bucket_name="")
        assert isinstance(build_object_storage(settings), UnconfiguredObjectStorage)

    def test_s3_when_bucket_configured(self) -> None:
        settings = Settings(
            env="test", storage_mode="real", pin_photo_bucket_name="sanposcape-dev-pin-photos-1"
        )
        assert isinstance(build_object_storage(settings), S3ObjectStorage)

    def test_non_real_storage_mode_fails_outside_local_and_test(self) -> None:
        with pytest.raises(ValueError, match="STORAGE_MODE"):
            Settings(
                env="staging",
                storage_mode="fake",
                auth_jwt_secret="x" * 32,
                google_allowed_audiences=["aud"],
                google_maps_server_api_key="key",
                database_dsn="postgresql://u:p@h/db",
            )


def _body(data: bytes):
    from io import BytesIO

    from botocore.response import StreamingBody

    return StreamingBody(BytesIO(data), len(data))

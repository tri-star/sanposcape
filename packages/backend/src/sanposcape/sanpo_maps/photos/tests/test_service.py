import logging
from datetime import UTC, datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session

from sanposcape.integrations.aws.s3 import FakeObjectStorage, PresignedUploadForm
from sanposcape.sanpo_maps.conftest import create_upload_row, make_user
from sanposcape.sanpo_maps.exceptions import (
    PinPhotoTooLargeError,
    StorageQuotaExceededError,
    TooManyPendingUploadsError,
)
from sanposcape.sanpo_maps.models import PinPhotoUpload
from sanposcape.sanpo_maps.photos.repository import PinPhotoUploadRepository
from sanposcape.sanpo_maps.photos.schemas import PinPhotoUploadCreate
from sanposcape.sanpo_maps.photos.service import PinPhotoUploadService

BASE_URL = "http://testserver/"


def make_upload_service(
    db_session: Session, storage: FakeObjectStorage, **overrides
) -> PinPhotoUploadService:
    kwargs = {
        "max_byte_size": 10 * 1024 * 1024,
        "user_quota_bytes": 1024**3,
        "max_pending_uploads": 30,
        "upload_url_ttl_seconds": 600,
        "attach_ttl_seconds": 21_600,
    }
    kwargs.update(overrides)
    return PinPhotoUploadService(
        db_session, PinPhotoUploadRepository(db_session), storage, **kwargs
    )


class TestPinPhotoUploadServiceCreateUpload:
    def test_creates_upload_and_returns_presigned_form(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_upload_service(db_session, storage)

        result = service.create_upload(
            user, PinPhotoUploadCreate(content_type="image/jpeg", byte_size=1000), base_url=BASE_URL
        )

        assert result.max_byte_size == 10 * 1024 * 1024
        assert result.upload.fields["key"].startswith(f"staging/pins/{user.id}/")

    def test_logs_upload_id_and_key_without_leaking_form_fields(
        self, db_session: Session, caplog: pytest.LogCaptureFixture
    ) -> None:
        """直送は backend を通らないため、発行した枠とキーはログに残す必要がある
        （ADR-009 決定13）。一方 `form.fields` は policy・署名・一時認証情報を含むため、
        1つでもログに出したら失敗させる（`integrations/aws/tests/test_secrets.py` と同じ流儀）。
        """
        user = make_user(db_session, subject="u1")

        class SentinelFieldsStorage(FakeObjectStorage):
            """`fields` の値を一目で分かる番兵にしたストレージ。

            `FakeObjectStorage` の素の `fields` は `x-fake-max-bytes=10485760` のように
            ログの別項目（`max_bytes`）と偶然一致する値を含み、部分文字列一致の検査が
            誤検知する。実 S3 の `policy` / `x-amz-signature` 相当が漏れていないことだけを
            確かめたいので、衝突しない値に置き換える。
            """

            def create_upload_form(self, **kwargs: object) -> PresignedUploadForm:
                form = super().create_upload_form(**kwargs)  # type: ignore[arg-type]
                fields = dict(form.fields)
                for name in fields:
                    if name not in ("key", "Content-Type"):
                        fields[name] = f"SENTINEL-{name}-must-not-be-logged"
                return PresignedUploadForm(url=form.url, fields=fields)

        storage = SentinelFieldsStorage(secret="s" * 32)
        service = make_upload_service(db_session, storage)

        with caplog.at_level(logging.INFO, logger="sanposcape.sanpo_maps.photos.service"):
            result = service.create_upload(
                user,
                PinPhotoUploadCreate(content_type="image/jpeg", byte_size=1000),
                base_url=BASE_URL,
            )

        messages = [record.getMessage() for record in caplog.records]
        assert any(str(result.upload_id) in message for message in messages)
        assert any(result.upload.fields["key"] in message for message in messages)
        # `key` と `Content-Type` は意図的にログしている（上で検証済み）。残りは policy・署名・
        # 一時認証情報の類で、1つでも出ていたら漏洩とみなす。
        logged_on_purpose = {"key", "Content-Type"}
        secret_values = [
            value for name, value in result.upload.fields.items() if name not in logged_on_purpose
        ]
        assert secret_values, "検証対象の fields が空では回帰テストとして意味がない"
        for value in secret_values:
            assert all(value not in message for message in messages), (
                f"presigned POST の fields がログに漏れている: {value[:16]}..."
            )

    def test_stores_taken_at_on_the_upload_row(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        service = make_upload_service(db_session, FakeObjectStorage(secret="s" * 32))
        taken_at = datetime(2026, 7, 2, 0, 14, 5, tzinfo=UTC)

        result = service.create_upload(
            user,
            PinPhotoUploadCreate(content_type="image/jpeg", byte_size=1000, taken_at=taken_at),
            base_url=BASE_URL,
        )

        db_session.expire_all()
        upload = db_session.get(PinPhotoUpload, result.upload_id)
        assert upload is not None
        assert upload.taken_at == taken_at

    def test_does_not_log_taken_at(
        self, db_session: Session, caplog: pytest.LogCaptureFixture
    ) -> None:
        # 撮影日時は行動の履歴に当たるのでログに出さない（ADR-009 決定34）。
        user = make_user(db_session, subject="u1")
        service = make_upload_service(db_session, FakeObjectStorage(secret="s" * 32))

        # 申告オフセット（+09:00 の 09:14:05）と UTC 換算（00:14:05）の両方を検査する。
        taken_at = datetime(2026, 7, 2, 9, 14, 5, tzinfo=timezone(timedelta(hours=9)))

        with caplog.at_level(logging.DEBUG, logger="sanposcape.sanpo_maps.photos.service"):
            result = service.create_upload(
                user,
                PinPhotoUploadCreate(content_type="image/jpeg", byte_size=1000, taken_at=taken_at),
                base_url=BASE_URL,
            )

        messages = [record.getMessage() for record in caplog.records]
        # ログ自体は出ている（空では「出ていない」の確認にならない）。
        assert any(str(result.upload_id) in message for message in messages)
        text = "\n".join(messages)
        for leaked in (
            "2026-07-02",
            "20260702",
            "2026/07/02",
            "09:14",
            "00:14",
            "+09:00",
            "taken_at",
        ):
            assert leaked not in text, f"撮影日時がログに漏れている: {leaked}"

    def test_too_large_raises(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_upload_service(db_session, storage, max_byte_size=100)

        with pytest.raises(PinPhotoTooLargeError):
            service.create_upload(
                user,
                PinPhotoUploadCreate(content_type="image/jpeg", byte_size=200),
                base_url=BASE_URL,
            )

    def test_pending_limit_raises(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        create_upload_row(db_session, user_id=user.id)
        service = make_upload_service(db_session, storage, max_pending_uploads=1)

        with pytest.raises(TooManyPendingUploadsError):
            service.create_upload(
                user,
                PinPhotoUploadCreate(content_type="image/jpeg", byte_size=100),
                base_url=BASE_URL,
            )

    def test_quota_exceeded_raises(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_upload_service(db_session, storage, user_quota_bytes=100)

        with pytest.raises(StorageQuotaExceededError):
            service.create_upload(
                user,
                PinPhotoUploadCreate(content_type="image/jpeg", byte_size=200),
                base_url=BASE_URL,
            )

    def test_quota_exactly_at_limit_succeeds(self, db_session: Session) -> None:
        user = make_user(db_session, subject="u1")
        storage = FakeObjectStorage(secret="s" * 32)
        service = make_upload_service(db_session, storage, user_quota_bytes=100)

        result = service.create_upload(
            user, PinPhotoUploadCreate(content_type="image/jpeg", byte_size=100), base_url=BASE_URL
        )
        assert result.upload_id is not None

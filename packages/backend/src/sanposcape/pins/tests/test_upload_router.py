import uuid

from fastapi.testclient import TestClient

from sanposcape.conftest import TestSessionLocal
from sanposcape.integrations.aws.s3 import FakeObjectStorage, ObjectStorageUnavailableError
from sanposcape.pins.models import PinPhotoUpload
from sanposcape.pins.photo_keys import staging_key
from sanposcape.pins.tests.conftest import create_upload_row, make_user, seed_staging_photo


def _upload_row_exists(upload_id: uuid.UUID) -> bool:
    """`db_session`（テスト側）とは別の新しいセッションで存在確認する。

    `db_session` はコミット済みオブジェクトを identity map に保持しているため、
    `db_session.get(...)` は expire 後でも `ObjectDeletedError` を送出しうる
    （walks の DELETE テストが GET エンドポイント経由で確認しているのと同じ理由で、
    ここでは別セッションでの素朴な存在確認に倒す）。
    """
    session = TestSessionLocal()
    try:
        return session.get(PinPhotoUpload, upload_id) is not None
    finally:
        session.close()


class TestCreatePinPhotoUpload:
    def test_requires_authentication(
        self, fake_storage_client: tuple[TestClient, FakeObjectStorage]
    ) -> None:
        client, _storage = fake_storage_client
        response = client.post(
            "/pin-photo-uploads", json={"content_type": "image/jpeg", "byte_size": 100}
        )
        assert response.status_code == 401

    def test_returns_presigned_form(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.post(
            "/pin-photo-uploads",
            headers=auth_headers,
            json={"content_type": "image/jpeg", "byte_size": 1000},
        )

        assert response.status_code == 201
        body = response.json()
        assert body["max_byte_size"] == 10 * 1024 * 1024
        assert "upload_id" in body
        assert body["upload"]["url"].endswith("/dev-storage/uploads")
        assert "key" in body["upload"]["fields"]

    def test_rejects_non_jpeg_content_type(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.post(
            "/pin-photo-uploads",
            headers=auth_headers,
            json={"content_type": "image/png", "byte_size": 1000},
        )
        assert response.status_code == 422

    def test_too_large_returns_413(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client
        response = client.post(
            "/pin-photo-uploads",
            headers=auth_headers,
            json={"content_type": "image/jpeg", "byte_size": 20 * 1024 * 1024},
        )
        assert response.status_code == 413

    def test_too_many_pending_returns_429(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user,
        db_session,
    ) -> None:
        client, _storage = fake_storage_client
        # 既定の PIN_PHOTO_MAX_PENDING_UPLOADS(30) 件を先に作っておく。
        for _ in range(30):
            create_upload_row(db_session, user_id=authenticated_user.id)

        response = client.post(
            "/pin-photo-uploads",
            headers=auth_headers,
            json={"content_type": "image/jpeg", "byte_size": 100},
        )
        assert response.status_code == 429

    def test_unconfigured_storage_returns_503(
        self, unconfigured_storage_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = unconfigured_storage_client.post(
            "/pin-photo-uploads",
            headers=auth_headers,
            json={"content_type": "image/jpeg", "byte_size": 100},
        )
        assert response.status_code == 503


class TestDeletePinPhotoUpload:
    """PR #93 T11: 未使用の枠を取り消す `DELETE /pin-photo-uploads/{upload_id}`。"""

    def test_requires_authentication(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        authenticated_user,
        db_session,
    ) -> None:
        client, _storage = fake_storage_client
        upload = create_upload_row(db_session, user_id=authenticated_user.id)

        response = client.delete(f"/pin-photo-uploads/{upload.id}")

        assert response.status_code == 401

    def test_deletes_pending_upload_and_its_staging_object(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user,
        db_session,
    ) -> None:
        client, storage = fake_storage_client
        upload = create_upload_row(db_session, user_id=authenticated_user.id)
        seed_staging_photo(storage, user_id=authenticated_user.id, upload_id=upload.id)

        response = client.delete(f"/pin-photo-uploads/{upload.id}", headers=auth_headers)

        assert response.status_code == 204
        assert response.content == b""
        assert not _upload_row_exists(upload.id)
        assert (
            storage.read_object(staging_key(user_id=authenticated_user.id, upload_id=upload.id))
            is None
        )

    def test_frees_the_pending_slot_and_reserved_capacity(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user,
        db_session,
    ) -> None:
        """削除した枠は、未使用枠の保有上限（429）と容量予約の計算から即座に外れる。"""
        client, _storage = fake_storage_client
        # 既定の PIN_PHOTO_MAX_PENDING_UPLOADS(30) 件で埋めてから1件だけ削除する。
        uploads = [create_upload_row(db_session, user_id=authenticated_user.id) for _ in range(30)]

        delete_response = client.delete(f"/pin-photo-uploads/{uploads[0].id}", headers=auth_headers)
        assert delete_response.status_code == 204

        create_response = client.post(
            "/pin-photo-uploads",
            headers=auth_headers,
            json={"content_type": "image/jpeg", "byte_size": 100},
        )
        assert create_response.status_code == 201

    def test_nonexistent_upload_returns_404(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
    ) -> None:
        client, _storage = fake_storage_client

        response = client.delete(f"/pin-photo-uploads/{uuid.uuid4()}", headers=auth_headers)

        assert response.status_code == 404

    def test_other_users_upload_returns_404_and_is_not_deleted(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        db_session,
    ) -> None:
        client, _storage = fake_storage_client
        other_user = make_user(db_session, subject="pins-test-user-other")
        upload = create_upload_row(db_session, user_id=other_user.id)

        response = client.delete(f"/pin-photo-uploads/{upload.id}", headers=auth_headers)

        assert response.status_code == 404
        assert _upload_row_exists(upload.id)

    def test_attached_upload_returns_409_and_is_not_deleted(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user,
        db_session,
    ) -> None:
        client, _storage = fake_storage_client
        upload = create_upload_row(db_session, user_id=authenticated_user.id, status="attached")

        response = client.delete(f"/pin-photo-uploads/{upload.id}", headers=auth_headers)

        assert response.status_code == 409
        assert _upload_row_exists(upload.id)

    def test_staging_delete_failure_is_best_effort(
        self,
        fake_storage_client: tuple[TestClient, FakeObjectStorage],
        auth_headers: dict[str, str],
        authenticated_user,
        db_session,
    ) -> None:
        """S3/フェイクストレージ側の削除が失敗しても、DB 行の削除は成功したまま 204 を返す。"""
        client, storage = fake_storage_client
        upload = create_upload_row(db_session, user_id=authenticated_user.id)

        def _boom(key: str) -> None:
            raise ObjectStorageUnavailableError("boom")

        storage.delete = _boom  # type: ignore[method-assign]

        response = client.delete(f"/pin-photo-uploads/{upload.id}", headers=auth_headers)

        assert response.status_code == 204
        assert not _upload_row_exists(upload.id)

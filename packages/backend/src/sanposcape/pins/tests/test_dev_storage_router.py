from fastapi.testclient import TestClient

from sanposcape.integrations.aws.s3 import FakeObjectStorage
from sanposcape.pins.tests.conftest import make_jpeg_bytes


class TestDevStorageIsFakeOnly:
    def test_not_included_when_storage_mode_is_real(self, client: TestClient) -> None:
        """ambient app（`.env` 由来。real/unconfigured 前提）では `/dev-storage/*` が
        存在しない（`STORAGE_MODE=fake` のときだけ main.py が include する）。
        """
        response = client.get("/dev-storage/objects/anything?expires=1&signature=x")
        assert response.status_code == 404

    def test_not_in_openapi_schema(self, client: TestClient) -> None:
        schema = client.get("/openapi.json").json()
        assert all(not path.startswith("/dev-storage") for path in schema["paths"])


class TestUpload:
    def test_success_returns_204_and_stores_object(
        self, fake_storage_client: tuple[TestClient, FakeObjectStorage]
    ) -> None:
        client, storage = fake_storage_client
        form = storage.create_upload_form(
            key="staging/pins/u1/up1.jpg",
            content_type="image/jpeg",
            max_bytes=1024,
            expires_in=600,
            base_url="http://testserver/",
        )
        data = make_jpeg_bytes()

        response = client.post(
            "/dev-storage/uploads",
            data=form.fields,
            files={"file": ("photo.jpg", data, "image/jpeg")},
        )

        assert response.status_code == 204
        assert storage.read_object("staging/pins/u1/up1.jpg") == (data, "image/jpeg")

    def test_wrong_signature_returns_403_xml(
        self, fake_storage_client: tuple[TestClient, FakeObjectStorage]
    ) -> None:
        client, storage = fake_storage_client
        form = storage.create_upload_form(
            key="staging/pins/u1/up1.jpg",
            content_type="image/jpeg",
            max_bytes=1024,
            expires_in=600,
            base_url="http://testserver/",
        )
        tampered_fields = {**form.fields, "x-fake-signature": "deadbeef"}

        response = client.post(
            "/dev-storage/uploads",
            data=tampered_fields,
            files={"file": ("photo.jpg", make_jpeg_bytes(), "image/jpeg")},
        )

        assert response.status_code == 403
        assert "<Code>AccessDenied</Code>" in response.text

    def test_expired_returns_403(
        self, fake_storage_client: tuple[TestClient, FakeObjectStorage]
    ) -> None:
        client, storage = fake_storage_client
        form = storage.create_upload_form(
            key="staging/pins/u1/up1.jpg",
            content_type="image/jpeg",
            max_bytes=1024,
            expires_in=-1,
            base_url="http://testserver/",
        )

        response = client.post(
            "/dev-storage/uploads",
            data=form.fields,
            files={"file": ("photo.jpg", make_jpeg_bytes(), "image/jpeg")},
        )

        assert response.status_code == 403

    def test_oversized_body_returns_400_xml(
        self, fake_storage_client: tuple[TestClient, FakeObjectStorage]
    ) -> None:
        client, storage = fake_storage_client
        form = storage.create_upload_form(
            key="staging/pins/u1/up1.jpg",
            content_type="image/jpeg",
            max_bytes=10,
            expires_in=600,
            base_url="http://testserver/",
        )

        response = client.post(
            "/dev-storage/uploads",
            data=form.fields,
            files={"file": ("photo.jpg", make_jpeg_bytes(), "image/jpeg")},
        )

        assert response.status_code == 400
        assert "<Code>EntityTooLarge</Code>" in response.text


class TestGetObject:
    def test_success_returns_200_with_content_type(
        self, fake_storage_client: tuple[TestClient, FakeObjectStorage]
    ) -> None:
        client, storage = fake_storage_client
        data = make_jpeg_bytes()
        storage.put_bytes("thumb/pins/u1/up1/512.jpg", data, content_type="image/jpeg")
        url = storage.create_download_url(
            key="thumb/pins/u1/up1/512.jpg", expires_in=3600, base_url="http://testserver/"
        )

        response = client.get(url.replace("http://testserver", ""))

        assert response.status_code == 200
        assert response.headers["content-type"] == "image/jpeg"
        assert response.content == data

    def test_missing_object_returns_404_xml(
        self, fake_storage_client: tuple[TestClient, FakeObjectStorage]
    ) -> None:
        client, storage = fake_storage_client
        url = storage.create_download_url(
            key="thumb/pins/u1/missing/512.jpg", expires_in=3600, base_url="http://testserver/"
        )

        response = client.get(url.replace("http://testserver", ""))

        assert response.status_code == 404
        assert "<Code>NoSuchKey</Code>" in response.text

    def test_wrong_signature_returns_403(
        self, fake_storage_client: tuple[TestClient, FakeObjectStorage]
    ) -> None:
        client, storage = fake_storage_client
        storage.put_bytes("thumb/pins/u1/up1/512.jpg", make_jpeg_bytes(), content_type="image/jpeg")

        response = client.get(
            "/dev-storage/objects/thumb/pins/u1/up1/512.jpg?expires=9999999999&signature=deadbeef"
        )

        assert response.status_code == 403

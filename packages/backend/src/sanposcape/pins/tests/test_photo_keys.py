import uuid

from sanposcape.config import Settings
from sanposcape.pins.photo_keys import THUMBNAIL_SIZES, original_key, staging_key, thumbnail_key

USER_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
UPLOAD_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")


class TestStagingKey:
    def test_format(self) -> None:
        assert staging_key(user_id=USER_ID, upload_id=UPLOAD_ID) == (
            f"staging/pins/{USER_ID}/{UPLOAD_ID}.jpg"
        )


class TestOriginalKey:
    def test_format(self) -> None:
        assert original_key(user_id=USER_ID, upload_id=UPLOAD_ID) == (
            f"original/pins/{USER_ID}/{UPLOAD_ID}.jpg"
        )


class TestThumbnailKey:
    def test_format(self) -> None:
        assert thumbnail_key(user_id=USER_ID, upload_id=UPLOAD_ID, size=512) == (
            f"thumb/pins/{USER_ID}/{UPLOAD_ID}/512.jpg"
        )

    def test_thumbnail_sizes_matches_default_settings_edge(self) -> None:
        # キーに埋め込むサイズ定数と設定値がずれると、生成したサムネイルのキーと
        # 実際に保存したキーが食い違う（backend-plan.md 5.8 の注記）。
        assert Settings().pin_photo_thumbnail_max_edge_px in THUMBNAIL_SIZES

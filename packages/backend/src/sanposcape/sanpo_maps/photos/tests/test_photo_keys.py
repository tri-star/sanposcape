import uuid

import pytest

from sanposcape.config import Settings
from sanposcape.sanpo_maps.photos.photo_keys import (
    THUMBNAIL_SIZES,
    original_key,
    staging_key,
    thumbnail_key,
    user_photo_prefixes,
)

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


class TestUserPhotoPrefixes:
    """アカウント削除後の削除（SS-109）は、利用者の全てのキーを prefix で覆う必要がある。"""

    def test_every_key_of_the_user_is_under_one_of_the_prefixes(self) -> None:
        prefixes = user_photo_prefixes(user_id=USER_ID)
        keys = [
            staging_key(user_id=USER_ID, upload_id=UPLOAD_ID),
            original_key(user_id=USER_ID, upload_id=UPLOAD_ID),
            *(
                thumbnail_key(user_id=USER_ID, upload_id=UPLOAD_ID, size=size)
                for size in THUMBNAIL_SIZES
            ),
        ]
        for key in keys:
            assert sum(key.startswith(prefix) for prefix in prefixes) == 1, key

    def test_prefixes_do_not_cover_other_users(self) -> None:
        """末尾の `/` で、ID が前方一致する別の利用者を巻き込まない。"""
        other = uuid.UUID("11111111-1111-1111-1111-111111111112")
        prefixes = user_photo_prefixes(user_id=USER_ID)
        assert all(prefix.endswith(f"/{USER_ID}/") for prefix in prefixes)
        assert not any(
            original_key(user_id=other, upload_id=UPLOAD_ID).startswith(prefix)
            for prefix in prefixes
        )

    @pytest.mark.parametrize("user_id", ["", str(USER_ID), None])
    def test_rejects_anything_but_a_uuid(self, user_id: object) -> None:
        """空文字の利用者 ID で全員の写真を消す prefix を作らない。"""
        with pytest.raises(TypeError):
            user_photo_prefixes(user_id=user_id)  # type: ignore[arg-type]

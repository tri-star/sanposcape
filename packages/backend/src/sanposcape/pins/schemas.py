import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_validator
from pydantic.json_schema import SkipJsonSchema

from sanposcape.core.geo import GeoPoint
from sanposcape.pins.tag_labels import dedupe_tags
from sanposcape.sanpo_maps.schemas import SanpoMapSummaryRead

# --- API 契約の定数（OpenAPI に出す値。walks/schemas.py と同じ流儀で SCREAMING_SNAKE_CASE） ---
PIN_NAME_MAX_LENGTH = 50
PIN_MEMO_MAX_LENGTH = 1000
PIN_TAGS_MAX_COUNT = 10
#: 1リクエストで紐付けられる写真の上限（Lambda の時間予算のため。ピン全体は無制限, B-Y2）。
PIN_PHOTOS_PER_REQUEST_MAX = 10
#: `PinRead.photos` に含める件数の上限（応答を有界に保つため）。
PIN_READ_PHOTOS_LIMIT = 10

#: 生入力（正規化前）に対する安全上の上限（DoS対策。PR #93 T5）。実際の公開上限
#: （`PIN_TAG_MAX_LENGTH` = 20文字）は正規化後に `tag_labels.dedupe_tags()` が検証する。
#: ここで厳しく絞ると、mobile なら正規化後に20文字以内になる入力（先頭の `#`/`＃` や
#: 前後の空白を含む）まで 422 になってしまうため、この型の役割は「異常に長い文字列で
#: 正規化処理を無駄に走らせない」ことに限定する。
_PIN_TAG_RAW_MAX_LENGTH = 200

PinTagLabel = Annotated[str, Field(min_length=1, max_length=_PIN_TAG_RAW_MAX_LENGTH)]


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


class PinPhotoUploadCreate(BaseModel):
    """`POST /pin-photo-uploads` のリクエスト。

    `width`/`height` は受け取らない（サーバーが確定時にデコードして実寸を得るため）。
    """

    content_type: Literal["image/jpeg"]
    byte_size: int = Field(ge=1)


class PresignedUploadRead(BaseModel):
    """presigned POST の応答。`fields` はクライアントが解釈せず、そのまま multipart で送る。"""

    url: str
    fields: dict[str, str]


class PinPhotoUploadRead(BaseModel):
    upload_id: uuid.UUID
    upload: PresignedUploadRead
    # presigned POST の有効期限（紐付け期限とは別。紐付け期限は応答に出さない）。
    expires_at: datetime
    max_byte_size: int


class PinCreate(BaseModel):
    # 冪等キー。`UNIQUE(created_by_user_id, client_pin_id)`。再送は 200 + 既存ピン。
    client_pin_id: uuid.UUID
    # 省略可・null 不可。省略 = 自分の既定地図（無ければ同一トランザクションで作成）。
    # `SkipJsonSchema[None]` により OpenAPI 上は non-nullable の optional として出る。
    sanpo_map_id: uuid.UUID | SkipJsonSchema[None] = None
    name: str | None = Field(default=None, max_length=PIN_NAME_MAX_LENGTH)
    memo: str | None = Field(default=None, max_length=PIN_MEMO_MAX_LENGTH)
    location: GeoPoint
    tags: list[PinTagLabel] = Field(default_factory=list, max_length=PIN_TAGS_MAX_COUNT)
    photo_upload_ids: list[uuid.UUID] = Field(
        default_factory=list, max_length=PIN_PHOTOS_PER_REQUEST_MAX
    )
    client_walk_id: uuid.UUID | None = None

    @field_validator("name", "memo", mode="before")
    @classmethod
    def _strip_and_blank_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            return _blank_to_none(value)
        return value

    @field_validator("tags")
    @classmethod
    def _normalize_and_dedupe_tags(cls, value: list[str]) -> list[str]:
        """サーバーでも mobile と同じ正規化を行い、大文字小文字違いの重複を黙って除去する。

        正規化後に空になったタグ（記号・空白のみ）がある場合は 422（`dedupe_tags` が
        `ValueError` を送出する。pydantic の field_validator 内の `ValueError` は
        自動的にバリデーションエラーへ変換される）。
        """
        return dedupe_tags(value)

    @field_validator("photo_upload_ids")
    @classmethod
    def _no_duplicate_photo_upload_ids(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(set(value)) != len(value):
            raise ValueError("photo_upload_ids must not contain duplicates")
        return value

    @model_validator(mode="after")
    def _sanpo_map_id_must_not_be_explicit_null(self) -> "PinCreate":
        if "sanpo_map_id" in self.model_fields_set and self.sanpo_map_id is None:
            raise ValueError("sanpo_map_id must not be null; omit the field to use the default map")
        return self


class PinPhotosAdd(BaseModel):
    """`POST /pins/{pin_id}/photos` のリクエスト。"""

    photo_upload_ids: list[uuid.UUID] = Field(min_length=1, max_length=PIN_PHOTOS_PER_REQUEST_MAX)

    @field_validator("photo_upload_ids")
    @classmethod
    def _no_duplicate_photo_upload_ids(cls, value: list[uuid.UUID]) -> list[uuid.UUID]:
        if len(set(value)) != len(value):
            raise ValueError("photo_upload_ids must not contain duplicates")
        return value


class PinTagRead(BaseModel):
    id: uuid.UUID
    label: str
    created_by_user_id: uuid.UUID


class PinPhotoThumbnailRead(BaseModel):
    url: str
    width: int
    height: int


class PinPhotoRead(BaseModel):
    id: uuid.UUID
    upload_id: uuid.UUID
    position: int
    # サーバーでデコードした実寸（クライアント申告ではない）。
    width: int
    height: int
    # S3 上の実サイズ。
    byte_size: int
    content_type: str
    # 生成待ち（将来の非同期化）や storage 不調時は null。
    thumbnail: PinPhotoThumbnailRead | None
    # この写真に含まれる URL の有効期限の上限（署名した Lambda の一時認証情報が
    # 先に切れると早く無効になりうる）。
    urls_expire_at: datetime
    uploaded_by_user_id: uuid.UUID
    created_at: datetime


class PinPhotoListRead(BaseModel):
    items: list[PinPhotoRead]
    photo_count: int


class PinRead(BaseModel):
    id: uuid.UUID
    client_pin_id: uuid.UUID
    sanpo_map: SanpoMapSummaryRead
    name: str | None
    memo: str | None
    location: GeoPoint
    tags: list[PinTagRead]
    # position 順で最大 PIN_READ_PHOTOS_LIMIT 件（枚数無制限のため応答を有界にする）。
    photos: list[PinPhotoRead]
    photo_count: int
    created_by_user_id: uuid.UUID
    client_walk_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

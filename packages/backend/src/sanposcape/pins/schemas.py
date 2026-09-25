import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.json_schema import SkipJsonSchema

from sanposcape.core.geo import GeoPoint
from sanposcape.pins.tag_labels import dedupe_tags, tag_key
from sanposcape.sanpo_maps.schemas import SanpoMapSummaryRead

# --- API 契約の定数（OpenAPI に出す値。walks/schemas.py と同じ流儀で SCREAMING_SNAKE_CASE） ---
PIN_NAME_MAX_LENGTH = 50
PIN_MEMO_MAX_LENGTH = 1000
PIN_TAGS_MAX_COUNT = 10
#: 1リクエストで紐付けられる写真の上限（Lambda の時間予算のため。ピン全体は無制限, B-Y2）。
PIN_PHOTOS_PER_REQUEST_MAX = 10
#: `PinRead.photos` に含める件数の上限（応答を有界に保つため）。
PIN_READ_PHOTOS_LIMIT = 10

# --- 閲覧 API（SS-111, BK-4）の定数 ---
PIN_LIST_DEFAULT_LIMIT = 50
PIN_LIST_MAX_LIMIT = 200
PIN_PHOTO_PAGE_DEFAULT_LIMIT = 30
PIN_PHOTO_PAGE_MAX_LIMIT = 100
#: `q`（前後の空白を除いた後の長さ）の上限。
PIN_SEARCH_QUERY_MAX_LENGTH = 100
#: `tags`（絞り込み用の複数指定）の上限件数。
PIN_SEARCH_TAGS_MAX_COUNT = 10

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


class PinConflictErrorRead(BaseModel):
    """`POST /pins`・`POST /pins/{pin_id}/photos` の 409 応答本体（PR #93 T15）。

    `detail` は既存クライアントとの後方互換のため固定文言のまま維持する。`code` は
    mobile が「容量超過」（`storage_quota_exceeded`）と「写真の準備ができていない」
    （`photo_upload_not_ready`。未完了・期限切れ・デコード不可などをまとめて表す,
    ADR-009 決定9）を区別するために新規追加した機械可読な値。
    """

    detail: str
    code: Literal["storage_quota_exceeded", "photo_upload_not_ready"]


class PinTagConflictErrorRead(BaseModel):
    """`PATCH /pins/{pin_id}` の 409 応答本体（タグの上限超過, ADR-009 決定20）。

    `PinConflictErrorRead` を再利用せず別スキーマにする。`code` の enum を広げると、
    `POST /pins` 等の他エンドポイントの 409 にも出ない値が載り、mobile（Orval）の
    網羅的な分岐にも影響するため。
    """

    detail: str
    code: Literal["tag_limit_exceeded"]


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


class PinUpdate(BaseModel):
    """`PATCH /pins/{pin_id}` のリクエスト（ADR-009 決定20）。

    「省略」と明示的な `null` は `model_fields_set` で区別する（`PinCreate.
    _sanpo_map_id_must_not_be_explicit_null` と同じ仕組み）。省略したフィールドは変更
    しない。`name`/`memo` は `null` か空白のみの値で「消す」（`PinCreate` と同じ正規化）。
    タグは全置換ではなく差分（`add_tags`/`remove_tag_ids`）で送る（共同編集での
    lost update・タグごとの権限判定の分かりやすさ・再送の安全性のため）。

    `extra="forbid"` にする理由: `location`/`sanpo_map_id` 等を送って「変更されたつもり」
    になる事故を防ぐため（PATCH は「送ったものだけが変わる」という意味を持つ）。
    """

    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, max_length=PIN_NAME_MAX_LENGTH)
    memo: str | None = Field(default=None, max_length=PIN_MEMO_MAX_LENGTH)
    # `SkipJsonSchema[None]` により OpenAPI 上は non-nullable の optional として出る
    # （明示的な `null` は `_add_tags_and_remove_tag_ids_must_not_be_explicit_null` で 422）。
    # `max_length` は `Annotated` でリスト側の型にだけ付ける（外側の `Field()` に付けると、
    # `None` を検証するときにも `len(None)` を試みて `TypeError` になる）。
    add_tags: (
        Annotated[list[PinTagLabel], Field(max_length=PIN_TAGS_MAX_COUNT)] | SkipJsonSchema[None]
    ) = Field(default_factory=list)
    remove_tag_ids: (
        Annotated[list[uuid.UUID], Field(max_length=PIN_TAGS_MAX_COUNT)] | SkipJsonSchema[None]
    ) = Field(default_factory=list)

    @field_validator("name", "memo", mode="before")
    @classmethod
    def _strip_and_blank_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            return _blank_to_none(value)
        return value

    @field_validator("add_tags")
    @classmethod
    def _normalize_and_dedupe_tags(cls, value: list[str] | None) -> list[str] | None:
        """`PinCreate.tags` と同じ正規化（サーバー側でも重複除去する, ADR-009 決定20）。

        明示的な `null` はここでは弾かず（`ValueError` を投げると 422 にはなるが、意図が
        「省略と同じ意味」に読める応答になりうる）そのまま通し、下の
        `model_validator` で専用のエラーメッセージにする。
        """
        if value is None:
            return None
        return dedupe_tags(value)

    @field_validator("remove_tag_ids")
    @classmethod
    def _no_duplicate_remove_tag_ids(cls, value: list[uuid.UUID] | None) -> list[uuid.UUID] | None:
        if value is None:
            return None
        if len(set(value)) != len(value):
            raise ValueError("remove_tag_ids must not contain duplicates")
        return value

    @model_validator(mode="after")
    def _add_tags_and_remove_tag_ids_must_not_be_explicit_null(self) -> "PinUpdate":
        for field_name in ("add_tags", "remove_tag_ids"):
            if field_name in self.model_fields_set and getattr(self, field_name) is None:
                raise ValueError(f"{field_name} must not be null; omit the field for no change")
        return self


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
    # 原本（端末で長辺2048px程度に縮小済み）の presigned GET。ストレージ未構成・障害時は
    # null（ADR-009 決定16・決定18）。mobile の画像キャッシュのキーには URL ではなく `id` を使う
    # （mobile ADR-010 決定8）。
    original_url: str | None
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


class PinListQuery(BaseModel):
    """`GET /pins` のクエリパラメータ（SS-111）。

    `Annotated[PinListQuery, Query()]` で受ける（FastAPI 0.141 は OpenAPI 上でも
    フィールドを1つずつ展開して出すため、Orval の型付けに影響しない）。
    `walks` の一覧と同様、`model_config` に `extra="forbid"` は付けない。
    """

    sanpo_map_id: uuid.UUID
    min_latitude: float | None = Field(default=None, ge=-90, le=90)
    min_longitude: float | None = Field(default=None, ge=-180, le=180)
    max_latitude: float | None = Field(default=None, ge=-90, le=90)
    max_longitude: float | None = Field(default=None, ge=-180, le=180)
    # 名前・メモ・タグの部分一致(ILIKE, 大文字小文字を区別しない)。前後の空白を除いて
    # 1〜100文字。空なら「条件なし」として扱う（ADR-009 追補「検索条件（q・tags）」）。
    q: str | None = Field(default=None, max_length=PIN_SEARCH_QUERY_MAX_LENGTH)
    # 複数指定は AND。`tag_key()` で正規化した値同士の完全一致で絞る。
    tags: list[PinTagLabel] = Field(default_factory=list, max_length=PIN_SEARCH_TAGS_MAX_COUNT)
    limit: int = Field(default=PIN_LIST_DEFAULT_LIMIT, ge=1, le=PIN_LIST_MAX_LIMIT)
    cursor: str | None = Field(default=None)

    @field_validator("q", mode="before")
    @classmethod
    def _strip_and_blank_to_none(cls, value: object) -> object:
        if isinstance(value, str):
            return _blank_to_none(value)
        return value

    @field_validator("tags")
    @classmethod
    def _normalize_and_dedupe_tag_keys(cls, value: list[str]) -> list[str]:
        """各タグを `tag_key()`（正規化 + 小文字化）に変換し、重複を除く。

        検索条件は `pin_tags.label_key` との完全一致で絞るため、`dedupe_tags()`
        （20文字の公開上限チェックを含む）ではなく `tag_key()` を直接使う。20文字を
        超える入力は単に「一致しない」だけで済むため、ここで長さを検証する理由が無い。
        正規化の結果が空になる入力（記号・空白のみ）だけ 422 にする。
        """
        seen: set[str] = set()
        normalized: list[str] = []
        for raw in value:
            key = tag_key(raw)
            if not key:
                raise ValueError(f"Tag label is empty after normalization: {raw!r}")
            if key in seen:
                continue
            seen.add(key)
            normalized.append(key)
        return normalized

    @model_validator(mode="after")
    def _validate_bounding_box(self) -> "PinListQuery":
        values = (self.min_latitude, self.max_latitude, self.min_longitude, self.max_longitude)
        provided = [value is not None for value in values]
        if any(provided) and not all(provided):
            raise ValueError(
                "min_latitude, max_latitude, min_longitude, and max_longitude must all be "
                "provided together, or all omitted"
            )
        if all(provided):
            if self.min_latitude > self.max_latitude:  # type: ignore[operator]
                raise ValueError("min_latitude must be <= max_latitude")
            if self.min_longitude > self.max_longitude:  # type: ignore[operator]
                raise ValueError("min_longitude must be <= max_longitude")
        return self


class PinListItemRead(BaseModel):
    """`GET /pins` の一覧要素。`memo` は含めない（ADR-009 決定15）。"""

    id: uuid.UUID
    sanpo_map_id: uuid.UUID
    name: str | None
    location: GeoPoint
    tags: list[PinTagRead]
    # position が最小の写真(無ければ null, ADR-009 決定15)。
    cover_photo: PinPhotoRead | None
    photo_count: int
    created_by_user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class PinListRead(BaseModel):
    items: list[PinListItemRead]
    next_cursor: str | None


class PinPhotoPageRead(BaseModel):
    """`GET /pins/{pin_id}/photos` の応答。既存の `PinPhotoListRead`（`POST` の応答で
    `next_cursor` を持つ意味が無い）とは別に用意する（ADR-009 決定17）。
    """

    items: list[PinPhotoRead]
    photo_count: int
    next_cursor: str | None

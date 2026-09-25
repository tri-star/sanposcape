import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.json_schema import SkipJsonSchema

#: `sanpo_map_members.role` と同じ値域（`models.py` の `SANPO_MAP_ROLES`）。
#: MVP では `owner` のみが出現する（editor は招待機能で登場する予約）。
SanpoMapRole = Literal["owner", "editor"]

#: 地図名の長さ上限（code point 数）。DB `String(50)`・ピン名（`PIN_NAME_MAX_LENGTH`）と
#: 同じ（ADR-009 決定25）。
SANPO_MAP_NAME_MAX_LENGTH = 50

#: `expand` に指定できる件数の上限。現状の選択肢は `pin_count` の1つだけだが、
#: `PinListQuery.tags`（`PIN_SEARCH_TAGS_MAX_COUNT`）と同じく無制限の配列を受け付けない
#: ため、小さい値で上限を設ける（将来 expand 対象が増えても十分な余裕）。
SANPO_MAP_LIST_EXPAND_MAX_LENGTH = 8


def _strip_name(value: str) -> str:
    """前後の空白を除去する。`str.strip()` は Unicode の空白（全角空白 U+3000・
    NBSP U+00A0 を含む）を除去するため、ピン名の正規化（`pins/schemas.py`
    `_blank_to_none` の `str.strip()`）と挙動を揃える。
    """
    return value.strip()


SanpoMapName = Annotated[str, Field(min_length=1, max_length=SANPO_MAP_NAME_MAX_LENGTH)]


class SanpoMapRead(BaseModel):
    id: uuid.UUID
    name: str
    # リクエストユーザーにとっての既定地図か（`sanpo_maps.is_default AND owner_user_id
    # == 自分`）。他人の既定地図に招待された editor には false（B-D2）。
    is_default: bool
    role: SanpoMapRole
    # `GET /sanpo-maps?expand=pin_count` を指定したときだけ整数で埋まる（ピンが無い
    # 地図は0）。それ以外（未指定・POST/PATCH の応答）は null（ADR-009 決定29）。
    pin_count: int | None = None
    created_at: datetime
    updated_at: datetime


class SanpoMapListRead(BaseModel):
    items: list[SanpoMapRead]
    # MVP では常に null（全件返す。ページングは将来 limit/cursor で expand）。
    next_cursor: str | None


class SanpoMapSummaryRead(BaseModel):
    """他ドメイン（`pins/schemas.py` の `PinRead.sanpo_map`）が埋め込む要約表現。"""

    id: uuid.UUID
    name: str
    is_default: bool


class SanpoMapCreate(BaseModel):
    """`POST /sanpo-maps` のリクエスト（ADR-009 決定25）。"""

    name: SanpoMapName

    @field_validator("name", mode="before")
    @classmethod
    def _strip(cls, value: object) -> object:
        if isinstance(value, str):
            return _strip_name(value)
        return value


class SanpoMapUpdate(BaseModel):
    """`PATCH /sanpo-maps/{sanpo_map_id}` のリクエスト（ADR-009 決定25。`pins/schemas.py`
    の `PinUpdate` と同じ流儀）。

    `extra="forbid"`。`name` は省略可・null 不可（`SkipJsonSchema[None]` により OpenAPI 上は
    non-nullable の optional として出る。明示的な `null` は `model_validator` で 422）。
    `{}` は 200 で何も変えない。
    """

    model_config = ConfigDict(extra="forbid")

    # `max_length` は `Annotated` 側に付ける（外側の `Field()` に付けると `None` の
    # 検証で `TypeError` になる。`PinUpdate.add_tags` と同じ注意）。
    name: SanpoMapName | SkipJsonSchema[None] = None

    @field_validator("name", mode="before")
    @classmethod
    def _strip(cls, value: object) -> object:
        if isinstance(value, str):
            return _strip_name(value)
        return value

    @model_validator(mode="after")
    def _name_must_not_be_explicit_null(self) -> "SanpoMapUpdate":
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name must not be null; omit the field for no change")
        return self


class SanpoMapListQuery(BaseModel):
    """`GET /sanpo-maps` のクエリパラメータ（ADR-009 決定29）。

    `Annotated[SanpoMapListQuery, Query()]` で受ける（`pins/schemas.py` の
    `PinListQuery` と同じ形）。将来の expand 対象（`member_count` 等）が増えても
    パラメータを増やさずに済むよう配列にしている。
    """

    expand: list[Literal["pin_count"]] = Field(
        default_factory=list, max_length=SANPO_MAP_LIST_EXPAND_MAX_LENGTH
    )

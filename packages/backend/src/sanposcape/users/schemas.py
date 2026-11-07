import uuid
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from sanposcape.users.display_name import (
    DISPLAY_NAME_MAX_LENGTH,
    FORBIDDEN_CHARACTERS_MESSAGE,
    has_forbidden_characters,
)


class DisplayNameUpdate(BaseModel):
    """`PATCH /users/me` のリクエスト（SS-268）。本人の表示名を変える。

    `display_name` は必須。前後の空白（全角を含む）を除去した後に 1〜50 code point。
    空（空白だけ）は 422（サインインの氏名と違い、利用者の明示の操作なので黙って捨てない）。
    null で消すことはできない。制御文字・行区切り・書式制御文字（ZWJ・ZWNJ は除く）を含むと 422。
    """

    model_config = ConfigDict(extra="forbid")

    display_name: Annotated[str, Field(min_length=1, max_length=DISPLAY_NAME_MAX_LENGTH)] = Field(
        description=(
            "新しい表示名。前後の空白は除去し、除去後に 1〜50 文字（code point）。"
            "制御文字・行区切り・書式制御文字（双方向制御やゼロ幅文字など。"
            "ZWJ・ZWNJ は除く）を含むと 422 になる。"
        ),
    )

    @field_validator("display_name", mode="before")
    @classmethod
    def _strip(cls, value: object) -> object:
        # `str.strip()` は Unicode の空白（全角空白 U+3000・NBSP を含む）も除く。
        if isinstance(value, str):
            return value.strip()
        return value

    @field_validator("display_name", mode="after")
    @classmethod
    def _reject_forbidden_characters(cls, value: str) -> str:
        if has_forbidden_characters(value):
            raise ValueError(FORBIDDEN_CHARACTERS_MESSAGE)
        return value


# `auth.schemas.AuthUserRead` を import せず同じ形を持つのは、依存の向き（`auth -> users`）を
# 保つため（docstring は OpenAPI の説明になるので、内部の事情はここに書く）。
class UserRead(BaseModel):
    """`PATCH /users/me` の応答（SS-268）。`GET /auth/me` の `AuthUserRead` と同じ形。"""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str | None
    display_name: str | None
    photo_url: str | None

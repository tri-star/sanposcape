import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

#: `sanpo_map_members.role` と同じ値域（`models.py` の `SANPO_MAP_ROLES`）。
#: MVP では `owner` のみが出現する（editor は招待機能で登場する予約）。
SanpoMapRole = Literal["owner", "editor"]


class SanpoMapRead(BaseModel):
    id: uuid.UUID
    name: str
    # リクエストユーザーにとっての既定地図か（`sanpo_maps.is_default AND owner_user_id
    # == 自分`）。他人の既定地図に招待された editor には false（B-D2）。
    is_default: bool
    role: SanpoMapRole
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

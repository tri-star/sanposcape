import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict


class SessionCreate(BaseModel):
    provider: Literal["google"]
    id_token: str


class SessionRefreshRequest(BaseModel):
    refresh_token: str


class SessionLogoutRequest(BaseModel):
    refresh_token: str


class AuthUserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str | None
    display_name: str | None
    photo_url: str | None


class SessionRead(BaseModel):
    access_token: str
    expires_in: int
    refresh_token: str
    user: AuthUserRead


class DevSessionCreate(BaseModel):
    """`AUTH_MODE=dev` 専用。OpenAPI には掲載しない（`dev_router.py` 側で制御）。"""

    user_key: str

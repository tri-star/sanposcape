import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

# refresh token は `secrets.token_urlsafe(32)` で約43文字。将来のTTL変更等の余地を見て
# 余裕を持たせつつ、上限を設けて低コストDoS（巨大な文字列を送りつけてパース/デコードに
# CPU・メモリを浪費させる）を防ぐ（B-1）。
_REFRESH_TOKEN_MAX_LENGTH = 512
# Google ID token（JWT）は claims の量に応じて長さが変わるが、通常は数KB以内に収まる。
# 4096文字あれば実運用のGoogle ID tokenを十分許容しつつ、上限としては機能する。
_ID_TOKEN_MAX_LENGTH = 4096


class SessionCreate(BaseModel):
    provider: Literal["google"]
    id_token: str = Field(max_length=_ID_TOKEN_MAX_LENGTH)


class SessionRefreshRequest(BaseModel):
    refresh_token: str = Field(max_length=_REFRESH_TOKEN_MAX_LENGTH)


class SessionLogoutRequest(BaseModel):
    refresh_token: str = Field(max_length=_REFRESH_TOKEN_MAX_LENGTH)


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

    user_key: str = Field(max_length=256)

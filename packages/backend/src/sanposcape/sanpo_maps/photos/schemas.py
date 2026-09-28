import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


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

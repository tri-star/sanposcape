import uuid
from datetime import UTC, datetime
from typing import Literal

from pydantic import AwareDatetime, BaseModel, Field, field_validator

#: 撮影日時として受け付ける範囲（瞬間で判定。上端は含まない。mobile と共有する静的な範囲, 決定34）。
TAKEN_AT_MIN = datetime(1900, 1, 1, tzinfo=UTC)
TAKEN_AT_MAX = datetime(2100, 1, 1, tzinfo=UTC)


class PinPhotoUploadCreate(BaseModel):
    """`POST /pin-photo-uploads` のリクエスト。

    `width`/`height` は受け取らない（サーバーが確定時にデコードして実寸を得るため）。
    `taken_at` は写真の撮影日時（オフセット付きの RFC 3339。不明なら省略か null）。
    """

    # `extra="forbid"` にしない: 古い backend と新しいアプリ／新しい backend と古いアプリの
    # 両方で未知のキーを無視するため（SS-163 R8）。
    # GPS・EXIF は受け取らない（原本は端末で再エンコード済みで EXIF が無い, ADR-009 決定34）。
    content_type: Literal["image/jpeg"]
    byte_size: int = Field(ge=1)
    taken_at: AwareDatetime | None = None

    @field_validator("taken_at")
    @classmethod
    def _validate_taken_at_range(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        # aware どうしの比較なので、オフセットが違っても瞬間で比べられる。
        # 実行時刻に依存する上限（「現在より未来は 422」）は付けない: WalkCreate.ended_at と違い、
        # ここで 422 にすると写真のアップロード自体が失敗する。表示にしか使わない申告値で
        # 写真を落とさない（端末の時計ずれ対策, 決定34）。
        if not (TAKEN_AT_MIN <= value < TAKEN_AT_MAX):
            raise ValueError(
                "taken_at must be between 1900-01-01T00:00:00Z (inclusive) "
                "and 2100-01-01T00:00:00Z (exclusive)"
            )
        return value


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

import uuid
from datetime import datetime, timedelta

from pydantic import AwareDatetime, BaseModel, Field, model_validator

from sanposcape.core.geo import GeoPoint

# --- バリデーション用の定数（SCREAMING_SNAKE_CASE、テストからも参照する） ---
MAX_TRACK_POINTS = 10_000
MAX_DISTANCE_METERS = 200_000
MAX_WALK_DURATION_SECONDS = 86_400  # 24時間
# クライアント申告の duration_seconds と wall-clock (ended_at - started_at) の
# 差分として許容する端末時計の丸め誤差。
CLOCK_SKEW_TOLERANCE_SECONDS = 300
# 未来日付の記録を弾く際に許容する猶予（送信の遅延・端末時計のわずかな進み）。
FUTURE_ENDED_AT_TOLERANCE_SECONDS = 300


class WalkDestinationCreate(BaseModel):
    place_id: str = Field(min_length=1, max_length=256)
    name: str = Field(min_length=1, max_length=256)
    location: GeoPoint


class WalkCreate(BaseModel):
    # mobile が散歩開始時に採番する冪等キー（D3）。保存直前ではなく開始時に採番すること。
    client_walk_id: uuid.UUID
    started_at: AwareDatetime
    ended_at: AwareDatetime
    # 一時停止を除いた実活動秒。ended_at - started_at とは別に受け取る（D4）。
    duration_seconds: int = Field(ge=0, le=MAX_WALK_DURATION_SECONDS)
    distance_meters: int = Field(ge=0, le=MAX_DISTANCE_METERS)
    destination: WalkDestinationCreate
    # 空配列を許容する（位置情報の権限拒否・取得失敗時も記録自体は残す）。
    track: list[GeoPoint] = Field(max_length=MAX_TRACK_POINTS)

    @model_validator(mode="after")
    def _validate_time_range(self) -> "WalkCreate":
        if self.ended_at <= self.started_at:
            raise ValueError("ended_at must be after started_at")

        wall_clock = self.ended_at - self.started_at
        if wall_clock > timedelta(seconds=MAX_WALK_DURATION_SECONDS):
            raise ValueError(
                f"ended_at - started_at must not exceed {MAX_WALK_DURATION_SECONDS} seconds"
            )

        wall_clock_seconds = wall_clock.total_seconds()
        if self.duration_seconds > wall_clock_seconds + CLOCK_SKEW_TOLERANCE_SECONDS:
            raise ValueError(
                "duration_seconds must not exceed (ended_at - started_at) beyond the "
                "allowed clock skew tolerance"
            )

        now = datetime.now(self.ended_at.tzinfo)
        if self.ended_at > now + timedelta(seconds=FUTURE_ENDED_AT_TOLERANCE_SECONDS):
            raise ValueError("ended_at must not be in the future")

        return self


class WalkDestinationRead(BaseModel):
    place_id: str
    name: str
    location: GeoPoint


class WalkRead(BaseModel):
    id: uuid.UUID
    client_walk_id: uuid.UUID
    started_at: datetime
    ended_at: datetime
    duration_seconds: int
    distance_meters: int
    destination: WalkDestinationRead
    created_at: datetime


class WalkDetailRead(WalkRead):
    track: list[GeoPoint]


class WalkListRead(BaseModel):
    items: list[WalkRead]
    next_cursor: str | None

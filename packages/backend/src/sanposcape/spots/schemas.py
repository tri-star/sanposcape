from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class SpotCreate(BaseModel):
    name: str
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    category: str | None = None


class SpotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    latitude: float
    longitude: float
    category: str | None
    created_at: datetime

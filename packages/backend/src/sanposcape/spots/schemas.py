from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SpotCreate(BaseModel):
    name: str
    latitude: float
    longitude: float
    category: str | None = None


class SpotRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    latitude: float
    longitude: float
    category: str | None
    created_at: datetime

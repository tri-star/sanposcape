from fastapi import FastAPI

from sanposcape.health.router import router as health_router
from sanposcape.spots.router import router as spots_router

app = FastAPI(
    title="sanposcape API",
    version="0.1.0",
    description="散歩支援アプリ sanposcape のバックエンド API",
)

app.include_router(health_router)
app.include_router(spots_router)

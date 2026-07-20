from collections.abc import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from sanposcape.config import get_settings

settings = get_settings()

engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    """全 SQLAlchemy モデルの共通基底クラス。"""


def get_db() -> Generator[Session, None, None]:
    """FastAPI 依存: リクエストスコープの DB セッションを供給する。"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

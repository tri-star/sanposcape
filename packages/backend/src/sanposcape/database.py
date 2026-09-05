from collections.abc import Generator
from functools import lru_cache

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from sanposcape.config import get_settings


class Base(DeclarativeBase):
    """全 SQLAlchemy モデルの共通基底クラス。"""


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    """DB engine を遅延生成する（プロセス内では 1 回だけ）。

    ★ import 時点で `create_engine` を呼ばない。Lambda では Secrets Manager から
    取得した DSN を環境変数へハイドレーションしてから `Settings` を組み立てる必要が
    あり（`aws_lambda/api.py`）、import 時点で engine を確定させるとハイドレーション前の
    設定で接続してしまう（`db:5432` へ接続を試み続けてタイムアウトする）。
    そのためモジュール直下では engine を作らず、呼び出し時に `get_settings()` を
    経由して初めて生成する。
    """
    settings = get_settings()
    return create_engine(settings.database_url, **settings.sqlalchemy_engine_kwargs)


@lru_cache(maxsize=1)
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, autocommit=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI 依存: リクエストスコープの DB セッションを供給する。"""
    db = get_session_factory()()
    try:
        yield db
    finally:
        db.close()

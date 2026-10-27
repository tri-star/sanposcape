"""移行のスクリプトのテストが使うテスト用 DB。

src/sanposcape/conftest.py の fixture・環境の隔離はこのディレクトリに効かないので、ここで持つ。
"""

from collections.abc import Generator

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from sanposcape.all_models import Base
from sanposcape.config import Settings

# テスト用 DB の接続先は、src/sanposcape/conftest.py と同じく import（collection）の時点で決める。
# src のテストは環境変数を消した状態で get_settings() を呼ぶことがあり、そのあとのキャッシュは
# 既定値（host=db）になる。コンテナでは既定値でも繋がるが、CI（DB_HOST=localhost）では繋がらない。
_AMBIENT = Settings()


@pytest.fixture(scope="module")
def engine() -> Generator[Engine, None, None]:
    # テスト用 DB に同じモデル定義のスキーマを用意する（全体の実行では src 側が作ったものを
    # そのまま使う）。
    engine = create_engine(_AMBIENT.test_database_url, pool_pre_ping=True)
    Base.metadata.create_all(engine)
    yield engine
    engine.dispose()


@pytest.fixture
def session_factory(engine: Engine) -> sessionmaker[Session]:
    with engine.begin() as conn:
        # src/sanposcape/conftest.py の _delete_all と同じく、閉じ忘れたセッションで無言に
        # 止まらないようにする（ADR-B-001 決定4）。
        conn.execute(text("SET LOCAL lock_timeout = '10s'"))
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
    return sessionmaker(bind=engine, autoflush=False)


@pytest.fixture
def test_db_settings() -> Settings:
    """`engine` と同じテスト用 DB に繋ぐ Settings（main() に渡す）。接続先はすべて明示する。"""
    return Settings(
        _env_file=None,
        database_dsn="",
        db_host=_AMBIENT.db_host,
        db_port=_AMBIENT.db_port,
        db_user=_AMBIENT.db_user,
        db_password=_AMBIENT.db_password,
        db_name=_AMBIENT.test_db_name,
    )

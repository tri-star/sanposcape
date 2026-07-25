"""pytest 共通フィクスチャ。

テスト用DB（TEST_DB_NAME）に対してスキーマを作成し、
FastAPI の DB 依存を差し替えた TestClient を提供する。
"""

from collections.abc import Generator

import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from sanposcape.all_models import Base
from sanposcape.config import Settings, get_settings
from sanposcape.database import get_db
from sanposcape.main import app, create_app

settings = get_settings()
test_engine = create_engine(settings.test_database_url, pool_pre_ping=True)
TestSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)


@pytest.fixture(autouse=True)
def _setup_schema() -> Generator[None, None, None]:
    """各テスト前後でスキーマを作り直し、テストを独立させる。"""
    Base.metadata.create_all(bind=test_engine)
    yield
    Base.metadata.drop_all(bind=test_engine)


@pytest.fixture
def db_session() -> Generator[Session, None, None]:
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


def override_get_db() -> Generator[Session, None, None]:
    """`get_db` の差し替え用。`auth/tests/test_dev_router.py` からも import される
    共有ヘルパーのため、モジュール内専用を示す `_` 接頭辞は付けない。"""
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture(scope="session")
def rsa_keypair() -> tuple[rsa.RSAPrivateKey, rsa.RSAPublicKey]:
    """テスト用 RSA 鍵ペア。生成コストが高いので session スコープ。"""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return private_key, private_key.public_key()


@pytest.fixture(scope="session")
def other_rsa_keypair() -> tuple[rsa.RSAPrivateKey, rsa.RSAPublicKey]:
    """署名不正パターンの検証用に、rsa_keypair とは別の鍵ペアを用意する。"""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return private_key, private_key.public_key()


@pytest.fixture
def test_settings() -> Settings:
    """`AUTH_MODE=real`（コード既定と同値）をテストコード内で明示構築したもの。

    開発者ローカルの `.env`（AUTH_MODE=dev が既定）に依存すると、ローカル実行と
    CI とでテスト結果が変わってしまうため、auth_mode に依存するテストは
    ambient な `main.app` ではなくこの明示的な設定から作った app を使う。
    """
    return Settings(
        env="test",
        auth_mode="real",
        auth_jwt_secret="x" * 32,
        google_allowed_audiences=["test-audience"],
    )


@pytest.fixture
def dev_settings() -> Settings:
    return Settings(
        env="test",
        auth_mode="dev",
        auth_jwt_secret="x" * 32,
        google_allowed_audiences=["test-audience"],
    )


@pytest.fixture
def dev_client(dev_settings: Settings) -> Generator[TestClient, None, None]:
    """`AUTH_MODE=dev` で組み立てたアプリのクライアント。"""
    dev_app = create_app(dev_settings)
    dev_app.dependency_overrides[get_db] = override_get_db
    dev_app.dependency_overrides[get_settings] = lambda: dev_settings
    with TestClient(dev_app) as test_client:
        yield test_client
    dev_app.dependency_overrides.clear()

"""pytest 共通フィクスチャ。

テスト用DB（TEST_DB_NAME）に対してスキーマを作成し、
FastAPI の DB 依存を差し替えた TestClient を提供する。
"""

from collections.abc import Generator
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from sanposcape.all_models import Base
from sanposcape.config import Settings, get_settings
from sanposcape.database import get_db
from sanposcape.main import app, create_app

# ★ この呼び出しは pytest がテストを1件でも実行する前（モジュール import = collection 時）に
#   走る。そのため下の `_isolate_settings_from_ambient_env` フィクスチャ（関数スコープ、
#   各テスト実行の直前に有効化される）の影響を受けない。テスト用DBの接続情報は
#   これまでどおり実際の `.env` / OS 環境変数（docker compose 経由）から解決される
#   （受け入れ条件3: DB 接続は従来どおり動く）。
settings = get_settings()
test_engine = create_engine(settings.test_database_url, pool_pre_ping=True)
TestSessionLocal = sessionmaker(bind=test_engine, autoflush=False, autocommit=False)


@pytest.fixture(autouse=True)
def _isolate_settings_from_ambient_env(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """テストコードが明示構築する `Settings(...)` を、開発者ローカルの `.env` /
    OS 環境変数から構造的に隔離する（SS-100）。

    背景: `.env.example`（→ `scripts/initialize-dotenv.sh` が生成する `.env`）は
    `FEATURE_FLAG_MODE=stub` を配っている。さらに `compose.yaml` はこの値を含む
    複数のフィールドを `api` コンテナの **OS 環境変数** としてもそのまま渡す
    （`environment:` セクション）。そのため `Settings(env="test")` のように一部の
    フィールドだけを明示したテストは、`.env` を生成した開発者の手元でだけ
    `feature_flag_mode` が `stub` になってしまい、`real`（コード既定）を前提にした
    テスト（`APPCONFIG_*` 未設定時の挙動など）が CI と食い違う形で落ちていた。

    これは `feature_flag_mode` だけの問題ではない。`Settings(...)` を明示構築する
    テストは、渡さなかったフィールドがすべて `.env` / OS 環境変数の影響を受けうる
    （例: 誰かが `.env` に `APPCONFIG_APPLICATION_ID` を設定すれば、また別のテストが
    同じ理由で落ちる）。個々のテストに値を渡して回る対症療法は次に別フィールドで
    再発するため、ここで一括して「明示的に渡さなかったフィールドは常にコード上の
    デフォルト値になる」ことを保証する。

    やっていることは2つ:
      1. `Settings` の全フィールド名に対応する環境変数を削除する
         （OS 環境変数 = `EnvSettingsSource` からの漏れ込みを断つ）。
      2. カレントディレクトリを空の一時ディレクトリへ退避する
         （`model_config` の `env_file=".env"` は相対パスなので、`.env` ファイル
         そのもの = `DotEnvSettingsSource` からの漏れ込みも断つ）。

    `tests/test_config.py` で先に確立していたパターン（同ファイル参照）をテスト
    スイート全体へ拡張したもの。

    ★ `settings` / `test_engine`（上のモジュール変数）はこのフィクスチャより前
      （import 時）に評価済みなので影響を受けない。`main.app`（`main.py` が import 時に
      `create_app()` で構築する ambient なアプリ）も同様に影響を受けない
      （`client` フィクスチャなど、ambient な `.env` に意図的に依存しているテストの
      挙動はこれまでどおり）。
    """
    for name in Settings.model_fields:
        monkeypatch.delenv(name.upper(), raising=False)
    monkeypatch.chdir(tmp_path)


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

"""pytest 共通フィクスチャ。

テスト用DB（TEST_DB_NAME）に対して、セッション開始時に1回だけスキーマを作成し、
各テストの前にテーブルの中身を空にする（SS-141）。
FastAPI の DB 依存を差し替えた TestClient を提供する。
"""

from collections.abc import Generator
from pathlib import Path

import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
from opentelemetry.instrumentation.threading import ThreadingInstrumentor
from opentelemetry.instrumentation.urllib import URLLibInstrumentor
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from sqlalchemy import create_engine, text
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


# `_setup_test_db_schema` の drop_all/create_all、`_delete_all` の DELETE に共通で使う
# ロック待ちタイムアウト。閉じ忘れたセッションが idle in transaction で残っていると、
# どちらの操作もロック待ちで無言に止まりうるため、原因を切り分けやすくするためエラーにする
# （ADR-B-001 決定1・決定4）。
_LOCK_TIMEOUT = "10s"


@pytest.fixture(scope="session", autouse=True)
def _setup_test_db_schema() -> Generator[None, None, None]:
    """テスト用DBのスキーマをセッション開始時に1回だけ作る（SS-141）。

    約1,100件のテストのたびに `create_all`/`drop_all`（DDL）を実行するコストが大きかった
    （PR #103 レビュー F-005）。スキーマ自体はテスト間で変わらないため、session スコープで
    1回だけ作れば足りる。テストごとの独立性は `_reset_tables`（各テストの前にテーブルの
    中身を空にする）で担保する。

    ★ なぜ最初に `drop_all` してから `create_all` するか: CI（`.github/workflows/
      backend-ci.yml`）は `TEST_DB_NAME` を `DB_NAME` と同じ値にしたうえで、テストの前に
      `alembic upgrade head` を流している。`create_all`（checkfirst）だけにすると、CI では
      テスト全体が alembic 由来のスキーマで動くように変わってしまう（今は最初の1件を除き、
      モデル定義（`Base.metadata`）から作ったスキーマで動いている）。drop_all を先に行う
      ことで、常にモデル定義由来のスキーマでテストが動くという今の性質を保つ。ローカルでも、
      前回の実行が落ちて残ったテーブルや別ブランチで列が変わったテーブルを使い回さない
      効果がある。
    ★ 終了時にも `drop_all` するのは、「テストが終わったらテスト用DBは空」という今までの
      終了時の状態を保つため。コストはセッション終了時の1回分だけ。
    ★ `drop_all`/`create_all` の前に `SET LOCAL lock_timeout` を設定するのは `_delete_all`
      と同じ理由（閉じ忘れたセッションによる無言のハング対策）。`drop_all`/`create_all` は
      ACCESS EXCLUSIVE 相当のロックを要求するため `_delete_all` と同種のリスクがあり、
      かつセッション全体で最初と最後に1回ずつしか実行されない分、ここでハングすると
      テストスイート全体が無診断で止まりうる。lock_timeout 超過時の調査方法は ADR-B-001 の
      決定4を参照。
    ★ 外側トランザクション + savepoint 巻き戻し案は採らない: その案ではテスト用セッションと
      アプリ用セッションが同じ接続を共有してしまい、「別セッションから見えるか」
      （`sanpo_maps/maps/tests/test_service.py::test_commits_and_is_visible_from_another_session`）や
      スレッドを使った FOR UPDATE の直列化（`auth/tests/test_repository.py`、
      `sanpo_maps/pins/tests/test_service.py`、`walks/tests/test_repository.py` など）、
      一意制約の競合（`users/tests/test_repository.py`）を検証するテストの意味が失われるため。
      詳細は `packages/backend/docs/adr/ADR-B-001-test-db-isolation-by-table-reset.md`。
    """
    with test_engine.begin() as conn:
        conn.execute(text(f"SET LOCAL lock_timeout = '{_LOCK_TIMEOUT}'"))
        Base.metadata.drop_all(bind=conn)
        Base.metadata.create_all(bind=conn)
    yield
    with test_engine.begin() as conn:
        conn.execute(text(f"SET LOCAL lock_timeout = '{_LOCK_TIMEOUT}'"))
        Base.metadata.drop_all(bind=conn)


# `_reset_tables` の後始末対象。`Base.metadata` に載っているテーブルだけを対象にすることで、
# 将来 PostGIS 等の拡張を入れても、拡張由来のテーブルや `alembic_version`（メタデータ外）は
# 構造的に対象から外れる（現状はどちらも存在しない。ADR-B-001 参照）。
_TABLES = Base.metadata.sorted_tables


def _delete_all() -> None:
    """全テーブルを `DELETE FROM` で空にする。

    TRUNCATE との比較計測（ADR-B-001）で、DELETE の方が明らかに速かった（テーブルが小さく
    ほぼ空の状態で毎回実行するため、TRUNCATE の ACCESS EXCLUSIVE ロック取得・カタログ更新の
    コストの方が相対的に高い）ため、こちらを採用した。`Base.metadata.sorted_tables` の
    逆順（子テーブルから）で削除することで、外部キー制約に違反しない。
    """
    with test_engine.begin() as conn:
        # 閉じ忘れたセッションが idle in transaction で残っていると DELETE は行ロック待ちで
        # 無言に止まりうる。今の drop_all も同種のロックを要求するため新しいリスクではないが、
        # 原因を切り分けやすくするためエラーにする。lock_timeout 超過時の調査方法は
        # ADR-B-001 の決定4を参照。
        conn.execute(text(f"SET LOCAL lock_timeout = '{_LOCK_TIMEOUT}'"))
        for table in reversed(_TABLES):
            conn.execute(table.delete())


@pytest.fixture(autouse=True)
def _reset_tables(_setup_test_db_schema: None) -> None:
    """各テストの**前**に全テーブルの中身を空にする（SS-141）。

    ★ なぜ「テストの後」ではなく「前」か: 前のテストの teardown が失敗しても（例外や
      ロック待ちタイムアウト）、次のテストは必ず空のテーブルから始まる。失敗が後続の
      テストへ連鎖しない。最後のテストが残したデータは、session 終了時の `drop_all`
      （`_setup_test_db_schema`）が片付ける。詳細は ADR-B-001。
    ★ TRUNCATE ではなく DELETE を選んだ理由・計測結果は `_delete_all` の docstring と
      ADR-B-001 を参照。
    """
    _delete_all()


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


# --- トレース（ADR-013 / SS-178）のテスト用フィクスチャ ---
# テストは自前の TracerProvider + InMemorySpanExporter を作り、`tracer_provider=` で計装へ渡す。
# `trace.set_tracer_provider` は使わない（プロセスで 1 回しか設定できず、他のテストへ漏れる）。


@pytest.fixture
def exporter() -> InMemorySpanExporter:
    return InMemorySpanExporter()


@pytest.fixture
def provider(exporter: InMemorySpanExporter) -> TracerProvider:
    tracer_provider = TracerProvider()
    tracer_provider.add_span_processor(SimpleSpanProcessor(exporter))
    return tracer_provider


@pytest.fixture
def clean_instrumentors() -> Generator[None, None, None]:
    """グローバル（singleton）な instrumentor を、テストの前後で未計装に揃える。

    開発者の `.env` で `TRACING_ENABLED=true` にしていても、ambient な `main.app` 経由で
    instrument 済みになる場合があるため。使うモジュールで `usefixtures` に指定する。
    """

    def reset() -> None:
        for instrumentor in (
            HTTPXClientInstrumentor(),
            ThreadingInstrumentor(),
            URLLibInstrumentor(),
            SQLAlchemyInstrumentor(),
        ):
            if instrumentor.is_instrumented_by_opentelemetry:
                instrumentor.uninstrument()

    reset()
    yield
    reset()

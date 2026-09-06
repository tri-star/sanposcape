from pathlib import Path

import pytest
from pydantic import ValidationError

from sanposcape.config import Settings, _to_sqlalchemy_url


@pytest.fixture(autouse=True)
def _isolate_settings_sources(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """`Settings` の外部入力（環境変数・`.env`）を遮断する。

    ここのテストは「引数で渡さなかった項目は既定値になる」ことを前提に
    バリデーションを検証している。しかし `Settings` は環境変数と `.env` も読むため、
    開発者の手元でその項目が設定されていると既定値にならず、テストの意味が変わってしまう。

    実際に `GOOGLE_MAPS_SERVER_API_KEY` を設定した環境では
    `test_production_without_google_maps_server_key_fails_to_start` が
    「キー未設定なのに起動できてしまう」ではなく「キーが設定されている」状態を
    検証することになり、失敗していた（CI はキーを設定しないため気付けなかった）。

    `env_file=".env"` は相対パスなので、カレントディレクトリを移すことで読み込みも防ぐ。
    """
    for name in Settings.model_fields:
        monkeypatch.delenv(name.upper(), raising=False)
    monkeypatch.chdir(tmp_path)


def test_production_with_non_real_auth_mode_fails_to_start() -> None:
    with pytest.raises(ValidationError):
        Settings(
            env="production",
            auth_mode="dev",
            auth_jwt_secret="x" * 32,
            google_allowed_audiences=["aud"],
        )


def test_production_without_secret_fails_to_start() -> None:
    with pytest.raises(ValidationError):
        Settings(
            env="production",
            auth_mode="real",
            auth_jwt_secret="",
            google_allowed_audiences=["aud"],
        )


def test_production_with_short_secret_fails_to_start() -> None:
    with pytest.raises(ValidationError):
        Settings(
            env="production",
            auth_mode="real",
            auth_jwt_secret="short-secret",
            google_allowed_audiences=["aud"],
        )


def test_production_without_allowed_audiences_fails_to_start() -> None:
    with pytest.raises(ValidationError):
        Settings(
            env="production",
            auth_mode="real",
            auth_jwt_secret="x" * 32,
            google_allowed_audiences=[],
        )


def test_production_with_valid_config_starts() -> None:
    settings = Settings(
        env="production",
        auth_mode="real",
        auth_jwt_secret="x" * 32,
        google_allowed_audiences=["aud"],
        google_maps_server_api_key="test-server-key",
        database_dsn="postgres://user:pw@host.example.com/db",
    )
    assert settings.auth_mode == "real"


def test_production_without_google_maps_server_key_fails_to_start() -> None:
    with pytest.raises(ValidationError):
        Settings(
            env="production",
            auth_mode="real",
            auth_jwt_secret="x" * 32,
            google_allowed_audiences=["aud"],
        )


@pytest.mark.parametrize(
    "field, value",
    [
        ("google_maps_connect_timeout_seconds", 0),
        ("google_maps_cache_ttl_seconds", 0),
        ("google_maps_rate_limit_requests", 0),
        ("google_maps_anonymous_rate_limit_requests", 0),
        ("google_maps_rate_limit_window_seconds", 0),
        ("google_maps_explore_request_max_bytes", 0),
        ("google_maps_max_place_candidates", 21),
    ],
)
def test_google_maps_resource_limits_must_be_positive_and_supported(field: str, value: int) -> None:
    with pytest.raises(ValidationError):
        Settings(**{field: value})


def test_anonymous_maps_rate_limit_must_not_exceed_authenticated_limit() -> None:
    with pytest.raises(ValidationError):
        Settings(
            google_maps_rate_limit_requests=10,
            google_maps_anonymous_rate_limit_requests=11,
        )


@pytest.mark.parametrize("value", [0, 4_194_305])
def test_walks_request_max_bytes_must_be_within_bounds(value: int) -> None:
    with pytest.raises(ValidationError):
        Settings(walks_request_max_bytes=value)


def test_staging_with_non_real_auth_mode_fails_to_start() -> None:
    """A-1: 許可リスト方式であれば staging も production と同じ fail-safe バリデーションを受ける。

    以前の実装は `if self.env == "production"` という否定リスト方式だったため、
    ENV=staging はこのチェックを素通りし、AUTH_MODE=dev で /auth/dev-session が
    有効になったまま起動できてしまっていた（認証バイパスの脆弱性）。
    """
    with pytest.raises(ValidationError):
        Settings(
            env="staging",
            auth_mode="dev",
            auth_jwt_secret="x" * 32,
            google_allowed_audiences=["aud"],
        )


def test_staging_without_secret_fails_to_start() -> None:
    """A-1: staging で AUTH_JWT_SECRET 未設定だと、以前はリポジトリ内の固定ダミー鍵に
    フォールバックしてしまっていた（署名鍵が GitHub 上で読める状態での起動）。許可リスト方式では
    production と同様に起動失敗するべき。
    """
    with pytest.raises(ValidationError):
        Settings(
            env="staging",
            auth_mode="real",
            auth_jwt_secret="",
            google_allowed_audiences=["aud"],
        )


def test_staging_without_allowed_audiences_fails_to_start() -> None:
    with pytest.raises(ValidationError):
        Settings(
            env="staging",
            auth_mode="real",
            auth_jwt_secret="x" * 32,
            google_allowed_audiences=[],
        )


def test_staging_with_valid_config_starts() -> None:
    settings = Settings(
        env="staging",
        auth_mode="real",
        auth_jwt_secret="x" * 32,
        google_allowed_audiences=["aud"],
        google_maps_server_api_key="test-server-key",
        database_dsn="postgres://user:pw@host.example.com/db",
    )
    assert settings.auth_mode == "real"


def test_csv_google_allowed_audiences_is_parsed_to_list() -> None:
    settings = Settings(google_allowed_audiences="aaa.example.com, bbb.example.com")
    assert settings.google_allowed_audiences == ["aaa.example.com", "bbb.example.com"]


def test_csv_google_allowed_issuers_is_parsed_to_list() -> None:
    settings = Settings(google_allowed_issuers="https://a.example.com,https://b.example.com")
    assert settings.google_allowed_issuers == ["https://a.example.com", "https://b.example.com"]


def test_non_production_falls_back_to_insecure_secret_when_unset() -> None:
    settings = Settings(env="local", auth_jwt_secret="")
    assert settings.auth_jwt_secret  # ダミー鍵にフォールバックする
    assert settings.auth_jwt_secret != ""


def test_non_production_keeps_explicit_secret() -> None:
    settings = Settings(env="local", auth_jwt_secret="my-secret")
    assert settings.auth_jwt_secret == "my-secret"


def test_production_with_fake_maps_mode_fails_to_start() -> None:
    """SS-44: MAPS_MODE も AUTH_MODE と同じ許可リスト方式で検証されること。

    `match="MAPS_MODE"` を付けているのは、他の必須項目（secret 等）の欠落でも
    ValidationError にはなるため、それだけでは「MAPS_MODE を検証している」証明に
    ならないため。
    """
    with pytest.raises(ValidationError, match="MAPS_MODE"):
        Settings(
            env="production",
            auth_mode="real",
            auth_jwt_secret="x" * 32,
            google_allowed_audiences=["aud"],
            google_maps_server_api_key="test-server-key",
            maps_mode="fake",
        )


def test_staging_with_fake_maps_mode_fails_to_start() -> None:
    """A-1 と対になる固定: 許可リスト方式は新しい env（staging）にも一律で効く。"""
    with pytest.raises(ValidationError, match="MAPS_MODE"):
        Settings(
            env="staging",
            auth_mode="real",
            auth_jwt_secret="x" * 32,
            google_allowed_audiences=["aud"],
            google_maps_server_api_key="test-server-key",
            maps_mode="fake",
        )


@pytest.mark.parametrize("env", ["local", "test"])
def test_local_and_test_env_allow_fake_maps_mode(env: str) -> None:
    settings = Settings(env=env, maps_mode="fake")
    assert settings.maps_mode == "fake"


def test_maps_mode_defaults_to_real() -> None:
    assert Settings().maps_mode == "real"


# --- 決定3: DSN の正規化 (`_to_sqlalchemy_url`) と `database_url` の優先順位 ---


def test_to_sqlalchemy_url_rewrites_postgres_scheme() -> None:
    result = _to_sqlalchemy_url("postgres://user:pw@host.example.com/db")
    assert result == "postgresql+psycopg://user:pw@host.example.com/db?sslmode=require"


def test_to_sqlalchemy_url_rewrites_postgresql_scheme() -> None:
    result = _to_sqlalchemy_url("postgresql://user:pw@host.example.com/db")
    assert result == "postgresql+psycopg://user:pw@host.example.com/db?sslmode=require"


def test_to_sqlalchemy_url_does_not_touch_explicit_driver() -> None:
    """`+driver` が既に指定されている場合は scheme を触らない。"""
    result = _to_sqlalchemy_url("postgresql+psycopg://user:pw@host.example.com/db")
    assert result == "postgresql+psycopg://user:pw@host.example.com/db?sslmode=require"


def test_to_sqlalchemy_url_keeps_existing_sslmode() -> None:
    result = _to_sqlalchemy_url("postgres://user:pw@host.example.com/db?sslmode=verify-full")
    assert "sslmode=verify-full" in result
    assert result.count("sslmode=") == 1


def test_to_sqlalchemy_url_passes_through_other_query_params() -> None:
    """`channel_binding` のような Neon 固有パラメータは素通しする。"""
    result = _to_sqlalchemy_url(
        "postgres://user:pw@host-pooler.example.com/db?channel_binding=require"
    )
    assert "channel_binding=require" in result
    assert "sslmode=require" in result


def test_database_dsn_takes_priority_over_db_star_fields() -> None:
    settings = Settings(
        db_host="ignored-host",
        database_dsn="postgres://dsn-user:dsn-pw@dsn-host.example.com/dsn-db",
    )
    assert settings.database_url == (
        "postgresql+psycopg://dsn-user:dsn-pw@dsn-host.example.com/dsn-db?sslmode=require"
    )


def test_database_url_falls_back_to_db_star_fields_when_dsn_unset() -> None:
    settings = Settings(db_host="db", db_port=5432, db_user="app", db_password="pw", db_name="app")
    assert settings.database_url == "postgresql+psycopg://app:pw@db:5432/app"


def test_test_database_url_is_unaffected_by_database_dsn() -> None:
    """テスト用DBの接続先がシークレット由来のDSNになってはいけない（誤って本番DBを触る事故防止）。"""
    settings = Settings(
        database_dsn="postgres://dsn-user:dsn-pw@dsn-host.example.com/dsn-db",
        db_host="db",
        db_user="app",
        db_password="pw",
        test_db_name="app_test",
    )
    assert settings.test_database_url == "postgresql+psycopg://app:pw@db:5432/app_test"
    assert "dsn-host" not in settings.test_database_url


@pytest.mark.parametrize("env", ["staging", "production"])
def test_non_local_env_without_database_dsn_fails_to_start(env: str) -> None:
    with pytest.raises(ValidationError, match="DATABASE_DSN"):
        Settings(
            env=env,
            auth_mode="real",
            auth_jwt_secret="x" * 32,
            google_allowed_audiences=["aud"],
            google_maps_server_api_key="test-server-key",
            database_dsn="",
        )


@pytest.mark.parametrize("env", ["staging", "production"])
def test_non_local_env_with_database_dsn_starts(env: str) -> None:
    settings = Settings(
        env=env,
        auth_mode="real",
        auth_jwt_secret="x" * 32,
        google_allowed_audiences=["aud"],
        google_maps_server_api_key="test-server-key",
        database_dsn="postgres://dsn-user:dsn-pw@dsn-host.example.com/dsn-db",
    )
    assert settings.database_dsn


@pytest.mark.parametrize("env", ["local", "test"])
def test_local_and_test_env_do_not_require_database_dsn(env: str) -> None:
    settings = Settings(env=env, database_dsn="")
    assert settings.database_url  # db_* からの組み立てで例外にならない


# --- 決定5: 接続プール設定 (`sqlalchemy_engine_kwargs`) ---


def test_sqlalchemy_engine_kwargs_defaults_do_not_disable_prepared_statements() -> None:
    settings = Settings()
    kwargs = settings.sqlalchemy_engine_kwargs
    assert kwargs["pool_size"] == 5
    assert kwargs["max_overflow"] == 10
    assert kwargs["pool_recycle"] == 280
    assert kwargs["pool_pre_ping"] is True
    assert "prepare_threshold" not in kwargs["connect_args"]


def test_sqlalchemy_engine_kwargs_can_disable_prepared_statements() -> None:
    """`DB_DISABLE_PREPARED_STATEMENTS=true` は `connect_args={"prepare_threshold": None}` になる。

    psycopg3 の生の意味では `prepare_threshold=0` は「初回実行から即座に prepare する」であり、
    これは無効化ではない（意味が逆）。この設定名がその混同を避けるためにあることの回帰テスト。
    """
    settings = Settings(db_disable_prepared_statements=True)
    connect_args = settings.sqlalchemy_engine_kwargs["connect_args"]
    assert connect_args["prepare_threshold"] is None


def test_sqlalchemy_engine_kwargs_reflects_custom_pool_settings() -> None:
    settings = Settings(db_pool_size=1, db_max_overflow=0, db_pool_recycle_seconds=280)
    kwargs = settings.sqlalchemy_engine_kwargs
    assert kwargs["pool_size"] == 1
    assert kwargs["max_overflow"] == 0


# --- M-2: マイグレーション専用 direct DSN (`migrate_database_url`) ---


def test_migrate_database_url_is_none_when_dsn_unset() -> None:
    assert Settings(migrate_database_dsn="").migrate_database_url is None


def test_migrate_database_url_normalizes_dsn() -> None:
    settings = Settings(migrate_database_dsn="postgres://user:pw@direct-host.example.com/db")
    assert settings.migrate_database_url == (
        "postgresql+psycopg://user:pw@direct-host.example.com/db?sslmode=require"
    )


def test_migrate_database_dsn_is_not_required_for_non_local_env() -> None:
    """`migrate_database_dsn` は API 本体の `_validate_environment_settings` の対象外
    （neon_dsn_unpooled が未投入でも Phase 1〜2 は完了できる必要があるため。M-2）。"""
    settings = Settings(
        env="production",
        auth_mode="real",
        auth_jwt_secret="x" * 32,
        google_allowed_audiences=["aud"],
        google_maps_server_api_key="test-server-key",
        database_dsn="postgres://user:pw@host.example.com/db",
        migrate_database_dsn="",
    )
    assert settings.migrate_database_url is None

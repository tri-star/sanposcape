from pathlib import Path

import pytest
from pydantic import ValidationError

from sanposcape.config import Settings


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
        ("google_maps_loop_duration_factor", 0.99),
        ("google_maps_loop_duration_factor", 2.01),
        ("google_maps_route_deadline_seconds", 0),
    ],
)
def test_google_maps_resource_limits_must_be_positive_and_supported(field: str, value: int) -> None:
    with pytest.raises(ValidationError):
        Settings(**{field: value})


def test_loop_route_settings_default_to_ss33_spike_values() -> None:
    """SS-33: kill switch は既定 ON、LOOP_FACTOR は実測中央値(1.10)ではなく1.15（誤差の非対称性を
    優先した値）、デッドラインは12秒。`routes-api-spike.md` / `config.py` のコメント参照。"""
    settings = Settings()
    assert settings.google_maps_loop_route_enabled is True
    assert settings.google_maps_loop_duration_factor == 1.15
    assert settings.google_maps_route_deadline_seconds == 12.0


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

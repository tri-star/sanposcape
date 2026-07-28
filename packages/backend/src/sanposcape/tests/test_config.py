import pytest
from pydantic import ValidationError

from sanposcape.config import Settings


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
        ("google_maps_rate_limit_window_seconds", 0),
        ("google_maps_explore_request_max_bytes", 0),
        ("google_maps_max_place_candidates", 21),
    ],
)
def test_google_maps_resource_limits_must_be_positive_and_supported(field: str, value: int) -> None:
    with pytest.raises(ValidationError):
        Settings(**{field: value})


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

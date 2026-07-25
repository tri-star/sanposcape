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

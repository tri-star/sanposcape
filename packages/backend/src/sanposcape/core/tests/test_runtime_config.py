import logging

import pytest

from sanposcape.config import get_settings
from sanposcape.core import runtime_config
from sanposcape.core.runtime_config import SECRET_KEY_TO_ENV, hydrate_environment_from_secret

_SECRET_ARN = "arn:aws:secretsmanager:ap-southeast-1:111111111111:secret:x"

_FULL_SECRET = {
    "neon_dsn": "postgresql://user:s3cr3t-pw@example-pooler.neon.tech/db",
    "jwt_signing_key": "x" * 32,
    "google_oauth_client_id": "client-id.apps.googleusercontent.com",
    "google_maps_server_api_key": "maps-key-value",
    "google_oauth_client_secret": "unused-by-backend",
}


@pytest.fixture(autouse=True)
def _isolate_secret_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """このモジュールが読み書きする環境変数を確実にテストごとへ隔離する。"""
    monkeypatch.delenv("APP_SECRET_ARN", raising=False)
    for env_name in SECRET_KEY_TO_ENV.values():
        monkeypatch.delenv(env_name, raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_noop_when_secret_arn_is_not_set(monkeypatch: pytest.MonkeyPatch) -> None:
    def _fail_if_called(secret_arn: str) -> dict[str, str]:
        raise AssertionError("get_secret_json must not be called without APP_SECRET_ARN")

    monkeypatch.setattr(runtime_config, "get_secret_json", _fail_if_called)

    hydrate_environment_from_secret()  # 例外が飛ばなければ OK


def test_hydrates_environment_variables_from_secret(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_SECRET_ARN", _SECRET_ARN)
    monkeypatch.setattr(runtime_config, "get_secret_json", lambda secret_arn: dict(_FULL_SECRET))

    hydrate_environment_from_secret()

    import os

    assert os.environ["DATABASE_DSN"] == _FULL_SECRET["neon_dsn"]
    assert os.environ["AUTH_JWT_SECRET"] == _FULL_SECRET["jwt_signing_key"]
    assert os.environ["GOOGLE_ALLOWED_AUDIENCES"] == _FULL_SECRET["google_oauth_client_id"]
    assert os.environ["GOOGLE_MAPS_SERVER_API_KEY"] == _FULL_SECRET["google_maps_server_api_key"]
    # google_oauth_client_secret はマッピングに含まれないので、対応する環境変数は無い
    assert "GOOGLE_OAUTH_CLIENT_SECRET" not in os.environ


def test_does_not_overwrite_explicitly_set_environment_variables(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("APP_SECRET_ARN", _SECRET_ARN)
    monkeypatch.setenv("DATABASE_DSN", "postgresql://explicit-override/db")
    monkeypatch.setattr(runtime_config, "get_secret_json", lambda secret_arn: dict(_FULL_SECRET))

    hydrate_environment_from_secret()

    import os

    assert os.environ["DATABASE_DSN"] == "postgresql://explicit-override/db"
    # 明示設定されていない項目は通常どおり写る
    assert os.environ["AUTH_JWT_SECRET"] == _FULL_SECRET["jwt_signing_key"]


def test_missing_keys_are_logged_without_secret_values(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    incomplete_secret = {"neon_dsn": _FULL_SECRET["neon_dsn"]}
    monkeypatch.setenv("APP_SECRET_ARN", _SECRET_ARN)
    monkeypatch.setattr(
        runtime_config, "get_secret_json", lambda secret_arn: dict(incomplete_secret)
    )

    with caplog.at_level(logging.INFO, logger="sanposcape.core.runtime_config"):
        hydrate_environment_from_secret()

    error_records = [r for r in caplog.records if r.levelno >= logging.ERROR]
    assert any("missing expected keys" in r.getMessage() for r in error_records)
    expected_missing_keys = (
        "jwt_signing_key",
        "google_oauth_client_id",
        "google_maps_server_api_key",
    )
    for expected_missing in expected_missing_keys:
        assert any(expected_missing in r.getMessage() for r in error_records)

    # シークレットの値は 1 バイトもログに出ない
    full_log_text = "\n".join(r.getMessage() for r in caplog.records)
    assert _FULL_SECRET["neon_dsn"] not in full_log_text


def test_secret_values_are_never_logged(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("APP_SECRET_ARN", _SECRET_ARN)
    monkeypatch.setattr(runtime_config, "get_secret_json", lambda secret_arn: dict(_FULL_SECRET))

    with caplog.at_level(logging.INFO, logger="sanposcape.core.runtime_config"):
        hydrate_environment_from_secret()

    full_log_text = "\n".join(r.getMessage() for r in caplog.records)
    for value in _FULL_SECRET.values():
        assert value not in full_log_text
    # キー名は出てよい
    assert "neon_dsn" in full_log_text


def test_calls_get_settings_cache_clear(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = []
    original_cache_clear = get_settings.cache_clear

    def _spy() -> None:
        calls.append(True)
        original_cache_clear()

    monkeypatch.setattr(get_settings, "cache_clear", _spy)
    monkeypatch.setenv("APP_SECRET_ARN", _SECRET_ARN)
    monkeypatch.setattr(runtime_config, "get_secret_json", lambda secret_arn: dict(_FULL_SECRET))

    hydrate_environment_from_secret()

    assert calls == [True]

from typing import get_args

from sanposcape.auth.dependencies import get_identity_providers
from sanposcape.auth.providers import build_identity_providers, warn_apple_disabled_once
from sanposcape.auth.providers.apple import AppleIdentityProvider
from sanposcape.auth.providers.jwks import get_jwks_client
from sanposcape.auth.schemas import SessionCreate
from sanposcape.config import Settings


def test_registers_apple_when_audience_is_configured() -> None:
    settings = Settings(env="test", apple_allowed_audiences=["com.sanposcape.app.dev"])

    providers = build_identity_providers(settings)

    assert set(providers) == {"google", "apple"}
    assert isinstance(providers["apple"], AppleIdentityProvider)


def test_does_not_register_apple_when_audience_is_empty(caplog) -> None:
    settings = Settings(env="test", apple_allowed_audiences=[])

    with caplog.at_level("WARNING"):
        providers = build_identity_providers(settings)

    assert set(providers) == {"google"}
    # レジストリの組み立ては副作用を持たない（リクエストごとに呼ばれるため）。
    assert "APPLE_ALLOWED_AUDIENCES" not in caplog.text


def test_apple_disabled_warning_is_logged_once_per_process(caplog) -> None:
    warn_apple_disabled_once.cache_clear()
    settings = Settings(env="test", apple_allowed_audiences=[])

    with caplog.at_level("WARNING"):
        for _ in range(3):
            get_identity_providers(settings)

    assert caplog.text.count("APPLE_ALLOWED_AUDIENCES is empty") == 1
    warn_apple_disabled_once.cache_clear()


def test_apple_disabled_warning_is_not_logged_when_configured(caplog) -> None:
    warn_apple_disabled_once.cache_clear()
    settings = Settings(env="test", apple_allowed_audiences=["com.sanposcape.app.dev"])

    with caplog.at_level("WARNING"):
        get_identity_providers(settings)

    assert "APPLE_ALLOWED_AUDIENCES" not in caplog.text


def test_schema_provider_literal_matches_fully_configured_registry() -> None:
    """provider 追加時に schemas / レジストリのどちらかを漏らさないための固定。"""
    settings = Settings(env="test", apple_allowed_audiences=["com.sanposcape.app.dev"])

    literal_values = set(get_args(SessionCreate.model_fields["provider"].annotation))

    assert literal_values == set(build_identity_providers(settings))


def test_jwks_clients_are_cached_per_uri_without_evicting_each_other() -> None:
    """Google と Apple が交互に使っても互いを追い出さない（maxsize=1 だと落ちる）。"""
    google = get_jwks_client("https://example.com/google-keys", 3600)
    apple = get_jwks_client("https://example.com/apple-keys", 3600)

    assert get_jwks_client("https://example.com/google-keys", 3600) is google
    assert get_jwks_client("https://example.com/apple-keys", 3600) is apple
    assert google is not apple

from sanposcape.auth.providers import build_identity_providers
from sanposcape.auth.providers.apple import AppleIdentityProvider
from sanposcape.auth.providers.jwks import get_jwks_client
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
    assert "APPLE_ALLOWED_AUDIENCES is empty" in caplog.text


def test_jwks_clients_are_cached_per_uri_without_evicting_each_other() -> None:
    """Google と Apple が交互に使っても互いを追い出さない（maxsize=1 だと落ちる）。"""
    google = get_jwks_client("https://example.com/google-keys", 3600)
    apple = get_jwks_client("https://example.com/apple-keys", 3600)

    assert get_jwks_client("https://example.com/google-keys", 3600) is google
    assert get_jwks_client("https://example.com/apple-keys", 3600) is apple
    assert google is not apple

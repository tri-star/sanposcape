import logging

import pytest

from sanposcape.auth.apple_authorization import exchange_apple_authorization_code
from sanposcape.auth.providers.base import ProviderIdentity
from sanposcape.auth.tests.conftest import APPLE_AUDIENCE, FakeAppleSignInClient
from sanposcape.integrations.apple.exceptions import (
    AppleSignInNotConfiguredError,
    AppleSignInRejectedError,
    AppleSignInUnavailableError,
)

CODE = "secret-authorization-code-0123"
SUBJECT = "apple-sub-1"


def _identity(**overrides) -> ProviderIdentity:
    values = {
        "provider": "apple",
        "subject": SUBJECT,
        "email": None,
        "display_name": None,
        "photo_url": None,
        "audience": APPLE_AUDIENCE,
    }
    return ProviderIdentity(**{**values, **overrides})


def _records(caplog):
    return [r for r in caplog.records if r.name == "sanposcape.auth.apple_authorization"]


class TestSkipsWithoutCallingApple:
    @pytest.mark.parametrize(
        "identity",
        [
            _identity(provider="google"),
            _identity(provider="dev"),
            _identity(audience=None),
        ],
        ids=["google", "dev", "no-audience"],
    )
    def test_conditions_not_met(self, identity: ProviderIdentity) -> None:
        client = FakeAppleSignInClient(subject=SUBJECT)

        assert exchange_apple_authorization_code(client, identity, CODE) is None
        assert client.exchange_calls == []

    @pytest.mark.parametrize("code", [None, ""])
    def test_no_code(self, code) -> None:
        client = FakeAppleSignInClient(subject=SUBJECT)

        assert exchange_apple_authorization_code(client, _identity(), code) is None
        assert client.exchange_calls == []

    def test_no_client(self) -> None:
        assert exchange_apple_authorization_code(None, _identity(), CODE) is None


class TestExchange:
    def test_exchanges_with_verified_audience_as_client_id(self) -> None:
        client = FakeAppleSignInClient(subject=SUBJECT)

        grant = exchange_apple_authorization_code(client, _identity(), CODE)

        assert client.exchange_calls == [(CODE, APPLE_AUDIENCE)]
        assert grant is not None
        assert grant.refresh_token == f"refresh-token-for-{CODE}"


class TestFailuresNeverRaise:
    def test_not_configured_is_silent(self, caplog) -> None:
        client = FakeAppleSignInClient(exchange_error=AppleSignInNotConfiguredError("x"))
        with caplog.at_level(logging.DEBUG):
            assert exchange_apple_authorization_code(client, _identity(), CODE) is None

        assert _records(caplog) == []

    def test_unavailable_is_warning(self, caplog) -> None:
        client = FakeAppleSignInClient(exchange_error=AppleSignInUnavailableError("down"))
        with caplog.at_level(logging.DEBUG):
            assert exchange_apple_authorization_code(client, _identity(), CODE) is None

        assert [r.levelno for r in _records(caplog)] == [logging.WARNING]
        assert "AppleSignInUnavailableError" in caplog.text

    def test_invalid_grant_is_warning(self, caplog) -> None:
        client = FakeAppleSignInClient(
            exchange_error=AppleSignInRejectedError("invalid_grant", 400)
        )
        with caplog.at_level(logging.DEBUG):
            assert exchange_apple_authorization_code(client, _identity(), CODE) is None

        assert [r.levelno for r in _records(caplog)] == [logging.WARNING]
        assert "invalid_grant" in caplog.text

    @pytest.mark.parametrize("error_code", ["invalid_client", "unauthorized_client"])
    def test_configuration_errors_are_error(self, caplog, error_code: str) -> None:
        client = FakeAppleSignInClient(exchange_error=AppleSignInRejectedError(error_code, 401))
        with caplog.at_level(logging.DEBUG):
            assert exchange_apple_authorization_code(client, _identity(), CODE) is None

        assert [r.levelno for r in _records(caplog)] == [logging.ERROR]
        assert error_code in caplog.text


class TestIdentityMatch:
    def test_subject_mismatch_is_dropped_with_warning(self, caplog) -> None:
        client = FakeAppleSignInClient(subject="someone-else")
        with caplog.at_level(logging.DEBUG):
            assert exchange_apple_authorization_code(client, _identity(), CODE) is None

        assert [r.levelno for r in _records(caplog)] == [logging.WARNING]

    def test_unreadable_subject_is_dropped(self) -> None:
        client = FakeAppleSignInClient(subject=None)

        assert exchange_apple_authorization_code(client, _identity(), CODE) is None

    def test_audience_mismatch_is_dropped(self) -> None:
        client = FakeAppleSignInClient(subject=SUBJECT, audience="another.bundle.id")

        assert exchange_apple_authorization_code(client, _identity(), CODE) is None


def test_code_and_tokens_never_logged(caplog) -> None:
    cases = [
        FakeAppleSignInClient(exchange_error=AppleSignInUnavailableError("down")),
        FakeAppleSignInClient(exchange_error=AppleSignInRejectedError("invalid_client", 401)),
        FakeAppleSignInClient(subject="someone-else"),
    ]
    with caplog.at_level(logging.DEBUG):
        for client in cases:
            exchange_apple_authorization_code(client, _identity(), CODE)

    assert CODE not in caplog.text
    assert f"refresh-token-for-{CODE}" not in caplog.text

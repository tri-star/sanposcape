import logging
from urllib.parse import parse_qs

import httpx
import jwt
import pytest

from sanposcape.auth.apple_authorization import exchange_apple_authorization_code
from sanposcape.auth.providers.base import ProviderIdentity
from sanposcape.auth.tests.conftest import APPLE_AUDIENCE, FakeAppleSignInClient
from sanposcape.config import Settings
from sanposcape.integrations.apple.client import HttpAppleSignInClient
from sanposcape.integrations.apple.exceptions import (
    AppleSignInClientSecretError,
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
        assert grant.client_id == APPLE_AUDIENCE
        assert grant.refresh_token == f"refresh-token-for-{CODE}"
        assert f"refresh-token-for-{CODE}" not in repr(grant)


class TestFailuresNeverRaise:
    def test_not_configured_is_silent(self, caplog) -> None:
        client = FakeAppleSignInClient(exchange_error=AppleSignInNotConfiguredError("x"))
        with caplog.at_level(logging.DEBUG):
            assert exchange_apple_authorization_code(client, _identity(), CODE) is None

        assert _records(caplog) == []

    def test_unavailable_is_warning(self, caplog) -> None:
        client = FakeAppleSignInClient(
            exchange_error=AppleSignInUnavailableError("down", reason="http_5xx")
        )
        with caplog.at_level(logging.DEBUG):
            assert exchange_apple_authorization_code(client, _identity(), CODE) is None

        assert [r.levelno for r in _records(caplog)] == [logging.WARNING]
        assert "http_5xx" in caplog.text

    def test_unavailable_logs_only_the_fixed_reason(self, caplog) -> None:
        error = AppleSignInUnavailableError("detail with arbitrary text", reason="timeout")
        client = FakeAppleSignInClient(exchange_error=error)
        with caplog.at_level(logging.DEBUG):
            assert exchange_apple_authorization_code(client, _identity(), CODE) is None

        assert "timeout" in caplog.text
        assert "arbitrary text" not in caplog.text

    def test_client_secret_failure_is_error(self, caplog) -> None:
        error = AppleSignInClientSecretError("Apple client secret could not be generated: X")
        client = FakeAppleSignInClient(exchange_error=error)
        with caplog.at_level(logging.DEBUG):
            assert exchange_apple_authorization_code(client, _identity(), CODE) is None

        assert [r.levelno for r in _records(caplog)] == [logging.ERROR]

    def test_unexpected_exception_is_swallowed_and_logged_as_type_only(self, caplog) -> None:
        """クライアントのバグ等でもサインインを落とさない。メッセージ（秘密を含みうる）は出さない。"""
        client = FakeAppleSignInClient(exchange_error=KeyError(f"leaked-{CODE}"))
        with caplog.at_level(logging.DEBUG):
            assert exchange_apple_authorization_code(client, _identity(), CODE) is None

        assert [r.levelno for r in _records(caplog)] == [logging.ERROR]
        assert "KeyError" in caplog.text
        assert CODE not in caplog.text

    def test_invalid_grant_is_the_only_expected_rejection_and_is_warning(self, caplog) -> None:
        client = FakeAppleSignInClient(
            exchange_error=AppleSignInRejectedError("invalid_grant", 400)
        )
        with caplog.at_level(logging.DEBUG):
            assert exchange_apple_authorization_code(client, _identity(), CODE) is None

        assert [r.levelno for r in _records(caplog)] == [logging.WARNING]
        assert "invalid_grant" in caplog.text

    @pytest.mark.parametrize(
        "error_code",
        ["invalid_client", "unauthorized_client", "invalid_request", "unknown"],
    )
    def test_other_rejections_are_error(self, caplog, error_code: str) -> None:
        """invalid_grant 以外の拒否（非 JSON の 4xx を含む "unknown"）は埋もれさせない。"""
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
        FakeAppleSignInClient(
            exchange_error=AppleSignInUnavailableError("down", reason="http_5xx")
        ),
        FakeAppleSignInClient(exchange_error=AppleSignInRejectedError("invalid_client", 401)),
        FakeAppleSignInClient(subject="someone-else"),
    ]
    with caplog.at_level(logging.DEBUG):
        for client in cases:
            exchange_apple_authorization_code(client, _identity(), CODE)

    assert CODE not in caplog.text
    assert f"refresh-token-for-{CODE}" not in caplog.text


def test_client_secret_never_logged(caplog, ec_private_key) -> None:
    """実際の HTTP クライアント（モック通信）で、Apple に送った client secret もログに出ない。"""
    refresh_token = "r1.refresh-token-secret-value"
    client_secrets: list[str] = []
    id_token = jwt.encode({"sub": "someone-else", "aud": APPLE_AUDIENCE}, "k" * 32, "HS256")
    responses = [
        httpx.Response(500, content=CODE.encode()),
        httpx.Response(400, json={"error": "invalid_client", "echo": CODE}),
        httpx.Response(400, content=b"<html>"),
        httpx.Response(200, json={"refresh_token": refresh_token, "id_token": id_token}),
    ]
    settings = Settings(apple_team_id="TEAM123456", apple_sign_in_key_id="KEY1234567")

    with caplog.at_level(logging.DEBUG):
        for response in responses:

            def handler(request: httpx.Request, response=response) -> httpx.Response:
                client_secrets.append(parse_qs(request.content.decode())["client_secret"][0])
                return response

            client = HttpAppleSignInClient(
                settings,
                private_key=ec_private_key,
                client=httpx.Client(transport=httpx.MockTransport(handler)),
            )
            assert exchange_apple_authorization_code(client, _identity(), CODE) is None

    assert len(client_secrets) == len(responses)
    for secret in [CODE, refresh_token, *client_secrets]:
        assert secret not in caplog.text

import logging
from datetime import UTC, datetime
from urllib.parse import parse_qs

import httpx
import jwt
import pytest

from sanposcape.config import Settings
from sanposcape.integrations.apple.client import (
    AppleTokenGrant,
    HttpAppleSignInClient,
    UnconfiguredAppleSignInClient,
    build_apple_sign_in_client,
)
from sanposcape.integrations.apple.exceptions import (
    AppleSignInNotConfiguredError,
    AppleSignInRejectedError,
    AppleSignInUnavailableError,
)

NOW = datetime(2026, 10, 12, 0, 0, 0, tzinfo=UTC)
CLIENT_ID = "com.sanposcape.app.dev"
CODE = "c0de-secret-authorization-code"
REFRESH_TOKEN = "r1.refresh-token-secret-value"


def _settings(**overrides) -> Settings:
    return Settings(apple_team_id="TEAM123456", apple_sign_in_key_id="KEY1234567", **overrides)


def _client(handler, ec_private_key, **settings_overrides) -> HttpAppleSignInClient:
    return HttpAppleSignInClient(
        _settings(**settings_overrides),
        private_key=ec_private_key,
        client=httpx.Client(transport=httpx.MockTransport(handler)),
        now=lambda: NOW,
    )


def _client_records(caplog) -> list[logging.LogRecord]:
    """Settings 構築時の無関係な警告（AUTH_JWT_SECRET）を除き、このクライアントのログだけ見る。"""
    return [r for r in caplog.records if r.name == "sanposcape.integrations.apple.client"]


def _form(request: httpx.Request) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(request.content.decode()).items()}


def _id_token(**claims) -> str:
    return jwt.encode(claims, "irrelevant-hs256-key-of-sufficient-length-0123", algorithm="HS256")


class TestExchangeAuthorizationCode:
    def test_posts_form_with_es256_client_secret(self, ec_private_key) -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(
                200,
                json={
                    "access_token": "a",
                    "token_type": "Bearer",
                    "expires_in": 3600,
                    "refresh_token": REFRESH_TOKEN,
                    "id_token": _id_token(sub="apple-sub-1", aud=CLIENT_ID),
                },
            )

        grant = _client(handler, ec_private_key).exchange_authorization_code(
            CODE, client_id=CLIENT_ID
        )

        assert len(seen) == 1
        request = seen[0]
        assert request.method == "POST"
        assert str(request.url) == "https://appleid.apple.com/auth/token"
        assert request.headers["content-type"] == "application/x-www-form-urlencoded"
        form = _form(request)
        assert set(form) == {"client_id", "client_secret", "code", "grant_type"}
        assert form["client_id"] == CLIENT_ID
        assert form["code"] == CODE
        assert form["grant_type"] == "authorization_code"
        assert "redirect_uri" not in form
        header = jwt.get_unverified_header(form["client_secret"])
        assert (header["alg"], header["kid"]) == ("ES256", "KEY1234567")
        claims = jwt.decode(
            form["client_secret"],
            ec_private_key.public_key(),
            algorithms=["ES256"],
            audience="https://appleid.apple.com",
            options={"verify_exp": False, "verify_iat": False},
        )
        assert (claims["iss"], claims["sub"]) == ("TEAM123456", CLIENT_ID)
        assert grant == AppleTokenGrant(REFRESH_TOKEN, "apple-sub-1", CLIENT_ID)

    def test_id_token_that_is_not_a_jwt_gives_no_subject(self, ec_private_key) -> None:
        def handler(request):
            return httpx.Response(200, json={"refresh_token": REFRESH_TOKEN, "id_token": "nope"})

        grant = _client(handler, ec_private_key).exchange_authorization_code(
            CODE, client_id=CLIENT_ID
        )

        assert grant.refresh_token == REFRESH_TOKEN
        assert grant.subject is None
        assert grant.audience is None

    def test_missing_id_token_gives_no_subject(self, ec_private_key) -> None:
        def handler(request):
            return httpx.Response(200, json={"refresh_token": REFRESH_TOKEN})

        grant = _client(handler, ec_private_key).exchange_authorization_code(
            CODE, client_id=CLIENT_ID
        )

        assert (grant.subject, grant.audience) == (None, None)

    def test_list_audience_is_not_trusted(self, ec_private_key) -> None:
        def handler(request):
            return httpx.Response(
                200,
                json={
                    "refresh_token": REFRESH_TOKEN,
                    "id_token": _id_token(sub="s", aud=["a", "b"]),
                },
            )

        grant = _client(handler, ec_private_key).exchange_authorization_code(
            CODE, client_id=CLIENT_ID
        )

        assert (grant.subject, grant.audience) == ("s", None)

    @pytest.mark.parametrize(
        "response",
        [
            httpx.Response(200, content=b"not json"),
            httpx.Response(200, json={"access_token": "a"}),
            httpx.Response(200, json={"refresh_token": ""}),
            httpx.Response(200, json={"refresh_token": 123}),
            httpx.Response(200, json=["refresh_token"]),
        ],
    )
    def test_unexpected_200_body_is_unavailable(self, ec_private_key, response) -> None:
        client = _client(lambda request: response, ec_private_key)

        with pytest.raises(AppleSignInUnavailableError):
            client.exchange_authorization_code(CODE, client_id=CLIENT_ID)


class TestRevokeRefreshToken:
    def test_posts_form_and_returns_nothing(self, ec_private_key) -> None:
        seen: list[httpx.Request] = []

        def handler(request: httpx.Request) -> httpx.Response:
            seen.append(request)
            return httpx.Response(200)

        result = _client(handler, ec_private_key).revoke_refresh_token(
            REFRESH_TOKEN, client_id=CLIENT_ID
        )

        assert result is None
        request = seen[0]
        assert str(request.url) == "https://appleid.apple.com/auth/revoke"
        assert request.headers["content-type"] == "application/x-www-form-urlencoded"
        form = _form(request)
        assert set(form) == {"client_id", "client_secret", "token", "token_type_hint"}
        assert form["token"] == REFRESH_TOKEN
        assert form["token_type_hint"] == "refresh_token"
        assert form["client_id"] == CLIENT_ID
        claims = jwt.decode(
            form["client_secret"],
            ec_private_key.public_key(),
            algorithms=["ES256"],
            audience="https://appleid.apple.com",
            options={"verify_exp": False, "verify_iat": False},
        )
        assert claims["sub"] == CLIENT_ID


def _call_exchange(client: HttpAppleSignInClient) -> None:
    client.exchange_authorization_code(CODE, client_id=CLIENT_ID)


def _call_revoke(client: HttpAppleSignInClient) -> None:
    client.revoke_refresh_token(REFRESH_TOKEN, client_id=CLIENT_ID)


@pytest.mark.parametrize("call", [_call_exchange, _call_revoke], ids=["exchange", "revoke"])
class TestErrorClassification:
    @pytest.mark.parametrize(
        ("response", "error_code", "status"),
        [
            (httpx.Response(400, json={"error": "invalid_grant"}), "invalid_grant", 400),
            (httpx.Response(400, json={"error": "invalid_request"}), "invalid_request", 400),
            (httpx.Response(401, json={"error": "invalid_client"}), "invalid_client", 401),
            (
                httpx.Response(400, json={"error": "unauthorized_client"}),
                "unauthorized_client",
                400,
            ),
            (httpx.Response(400, json={"error": "something-new"}), "unknown", 400),
            (httpx.Response(400, json={"error": 7}), "unknown", 400),
            (httpx.Response(400, json=["x"]), "unknown", 400),
            (httpx.Response(400, content=b"<html>"), "unknown", 400),
            (httpx.Response(403, content=b""), "unknown", 403),
        ],
    )
    def test_4xx_is_rejected_with_normalized_code(
        self, ec_private_key, call, response, error_code, status
    ) -> None:
        client = _client(lambda request: response, ec_private_key)

        with pytest.raises(AppleSignInRejectedError) as excinfo:
            call(client)

        assert excinfo.value.error_code == error_code
        assert excinfo.value.status_code == status

    @pytest.mark.parametrize("status", [429, 500, 502, 503, 504])
    def test_429_and_5xx_are_unavailable(self, ec_private_key, call, status) -> None:
        client = _client(lambda request: httpx.Response(status), ec_private_key)

        with pytest.raises(AppleSignInUnavailableError):
            call(client)

    @pytest.mark.parametrize("status", [201, 204, 302])
    def test_other_statuses_are_unavailable(self, ec_private_key, call, status) -> None:
        client = _client(lambda request: httpx.Response(status), ec_private_key)

        with pytest.raises(AppleSignInUnavailableError):
            call(client)

    @pytest.mark.parametrize(
        "error",
        [
            httpx.ConnectTimeout("t"),
            httpx.ReadTimeout("t"),
            httpx.ConnectError("c"),
            httpx.ReadError("r"),
        ],
        ids=lambda e: type(e).__name__,
    )
    def test_timeouts_and_transport_errors_are_unavailable(
        self, ec_private_key, call, error
    ) -> None:
        def handler(request):
            raise error

        client = _client(handler, ec_private_key)

        with pytest.raises(AppleSignInUnavailableError) as excinfo:
            call(client)

        assert type(error).__name__ in str(excinfo.value)

    def test_secrets_never_appear_in_exception_messages_or_logs(
        self, ec_private_key, call, caplog
    ) -> None:
        sensitive = [CODE, REFRESH_TOKEN]
        outcomes = [
            httpx.Response(400, json={"error": "invalid_grant", "echo": CODE}),
            httpx.Response(500, content=REFRESH_TOKEN.encode()),
        ]
        caplog.set_level(logging.DEBUG)
        for response in outcomes:
            client = _client(lambda request, r=response: r, ec_private_key)
            with pytest.raises(Exception) as excinfo:  # noqa: PT011
                call(client)
            text = f"{excinfo.value!s} {excinfo.value!r}"
            assert all(value not in text for value in sensitive)
        assert all(value not in caplog.text for value in sensitive)


class TestTimeouts:
    def test_default_client_uses_configured_connect_and_read_timeouts(self, ec_private_key) -> None:
        client = HttpAppleSignInClient(
            _settings(
                apple_sign_in_connect_timeout_seconds=1.5,
                apple_sign_in_read_timeout_seconds=4.0,
            ),
            private_key=ec_private_key,
        )
        try:
            timeout = client._client.timeout
            assert timeout.connect == 1.5
            assert timeout.read == 4.0
        finally:
            client.close()

    def test_injected_client_is_not_closed_by_close(self, ec_private_key) -> None:
        injected = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200)))
        client = HttpAppleSignInClient(
            _settings(), private_key=ec_private_key, client=injected, now=lambda: NOW
        )

        client.close()

        assert not injected.is_closed


class TestUnconfiguredClient:
    def test_both_operations_raise_not_configured(self) -> None:
        client = UnconfiguredAppleSignInClient()

        with pytest.raises(AppleSignInNotConfiguredError):
            client.exchange_authorization_code(CODE, client_id=CLIENT_ID)
        with pytest.raises(AppleSignInNotConfiguredError):
            client.revoke_refresh_token(REFRESH_TOKEN, client_id=CLIENT_ID)


class TestGrantRepr:
    def test_repr_hides_refresh_token(self) -> None:
        grant = AppleTokenGrant(REFRESH_TOKEN, "sub", "aud")

        assert REFRESH_TOKEN not in repr(grant)


class TestBuildAppleSignInClient:
    def test_all_empty_is_unconfigured_without_logs_when_apple_sign_in_disabled(
        self, caplog
    ) -> None:
        with caplog.at_level(logging.DEBUG):
            client = build_apple_sign_in_client(Settings())

        assert isinstance(client, UnconfiguredAppleSignInClient)
        assert _client_records(caplog) == []

    def test_all_empty_warns_once_when_apple_sign_in_is_enabled(self, caplog) -> None:
        with caplog.at_level(logging.DEBUG):
            client = build_apple_sign_in_client(
                Settings(apple_allowed_audiences=["com.sanposcape.app.dev"])
            )

        assert isinstance(client, UnconfiguredAppleSignInClient)
        assert [r.levelno for r in _client_records(caplog)] == [logging.WARNING]

    def test_partial_settings_log_missing_names_as_error(self, caplog, ec_private_key_pem) -> None:
        with caplog.at_level(logging.DEBUG):
            client = build_apple_sign_in_client(
                Settings(apple_team_id="TEAM123456", apple_sign_in_private_key=ec_private_key_pem)
            )

        assert isinstance(client, UnconfiguredAppleSignInClient)
        assert [r.levelno for r in _client_records(caplog)] == [logging.ERROR]
        assert "APPLE_SIGN_IN_KEY_ID" in caplog.text
        assert "APPLE_TEAM_ID" not in caplog.text
        assert "BEGIN" not in caplog.text

    def test_invalid_pem_is_unconfigured_and_never_logged(self, caplog) -> None:
        pem = "-----BEGIN PRIVATE KEY-----\nSECRETPEMBODY\n-----END PRIVATE KEY-----"
        with caplog.at_level(logging.DEBUG):
            client = build_apple_sign_in_client(_settings(apple_sign_in_private_key=pem))

        assert isinstance(client, UnconfiguredAppleSignInClient)
        assert [r.levelno for r in _client_records(caplog)] == [logging.ERROR]
        assert "SECRETPEMBODY" not in caplog.text

    def test_complete_settings_build_http_client(self, ec_private_key_pem) -> None:
        client = build_apple_sign_in_client(_settings(apple_sign_in_private_key=ec_private_key_pem))

        assert isinstance(client, HttpAppleSignInClient)
        client.close()


class TestSettings:
    def test_literal_backslash_n_in_private_key_is_restored_to_newlines(
        self, ec_private_key_pem
    ) -> None:
        one_line = ec_private_key_pem.strip().replace("\n", "\\n")

        settings = Settings(apple_sign_in_private_key=one_line)

        assert settings.apple_sign_in_private_key.get_secret_value() == ec_private_key_pem.strip()

    def test_real_newlines_are_kept(self, ec_private_key_pem) -> None:
        settings = Settings(apple_sign_in_private_key=ec_private_key_pem)

        assert settings.apple_sign_in_private_key.get_secret_value() == ec_private_key_pem

    def test_repr_does_not_expose_private_key(self, ec_private_key_pem) -> None:
        settings = Settings(apple_sign_in_private_key=ec_private_key_pem)

        assert "BEGIN" not in repr(settings)
        assert ec_private_key_pem.splitlines()[1] not in repr(settings)

    def test_default_timeouts(self) -> None:
        settings = Settings()

        assert settings.apple_sign_in_connect_timeout_seconds == 2.0
        assert settings.apple_sign_in_read_timeout_seconds == 5.0

    @pytest.mark.parametrize(
        "field", ["apple_sign_in_connect_timeout_seconds", "apple_sign_in_read_timeout_seconds"]
    )
    @pytest.mark.parametrize("value", [0, -1, 11])
    def test_timeouts_are_bounded(self, field: str, value: float) -> None:
        with pytest.raises(ValueError):  # noqa: PT011
            Settings(**{field: value})

import pytest
from starlette.datastructures import Headers
from starlette.requests import Request

from sanposcape.auth.exceptions import MalformedAuthorizationHeaderError
from sanposcape.auth.headers import extract_bearer_token


def _request_with_headers(headers: dict[str, str]) -> Request:
    scope = {
        "type": "http",
        "headers": Headers(headers).raw,
    }
    return Request(scope)


def test_no_header_returns_none() -> None:
    assert extract_bearer_token(_request_with_headers({})) is None


def test_x_app_authorization_is_preferred_over_authorization() -> None:
    request = _request_with_headers(
        {
            "X-App-Authorization": "Bearer app-token",
            "Authorization": "Bearer cloudfront-signature",
        }
    )
    assert extract_bearer_token(request) == "app-token"


def test_authorization_alone_still_works() -> None:
    """CloudFront を経由しないローカル開発 / CI では従来どおり `Authorization` のみで通る。"""
    request = _request_with_headers({"Authorization": "Bearer only-token"})
    assert extract_bearer_token(request) == "only-token"


def test_x_app_authorization_alone_works() -> None:
    request = _request_with_headers({"X-App-Authorization": "Bearer only-token"})
    assert extract_bearer_token(request) == "only-token"


@pytest.mark.parametrize(
    "value",
    [
        "Basic dXNlcjpwYXNz",  # 別スキーム
        "Bearer",  # トークン無し
        "Bearer ",  # 空トークン
        "token-without-scheme",
    ],
)
def test_malformed_authorization_header_is_rejected(value: str) -> None:
    request = _request_with_headers({"Authorization": value})
    with pytest.raises(MalformedAuthorizationHeaderError):
        extract_bearer_token(request)


def test_malformed_x_app_authorization_does_not_fall_back_to_authorization() -> None:
    """優先度の高いヘッダーが不正な形式でも、低い方へ静かにフォールバックしない。"""
    request = _request_with_headers(
        {
            "X-App-Authorization": "Basic malformed",
            "Authorization": "Bearer valid-token",
        }
    )
    with pytest.raises(MalformedAuthorizationHeaderError) as exc_info:
        extract_bearer_token(request)
    assert exc_info.value.header_name == "X-App-Authorization"

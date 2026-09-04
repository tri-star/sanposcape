import json
import logging
from collections.abc import Generator
from typing import Any

import pytest
from botocore.exceptions import ClientError

from sanposcape.integrations.aws.secrets import get_secret_json

_ARN = "arn:aws:secretsmanager:ap-southeast-1:111111111111:secret:x"


@pytest.fixture(autouse=True)
def _clear_secret_cache() -> Generator[None, None, None]:
    get_secret_json.cache_clear()
    yield
    get_secret_json.cache_clear()


class _FakeSecretsManagerClient:
    """boto3 の secretsmanager クライアントの最小限のスタブ。"""

    def __init__(
        self, responses: dict[str, Any] | None = None, error: ClientError | None = None
    ) -> None:
        self.calls: list[str] = []
        self._responses = responses or {}
        self._error = error

    def get_secret_value(self, SecretId: str) -> dict[str, Any]:  # noqa: N803 (boto3 API に合わせる)
        self.calls.append(SecretId)
        if self._error is not None:
            raise self._error
        return {"SecretString": json.dumps(self._responses[SecretId])}


def test_get_secret_json_parses_json(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_client = _FakeSecretsManagerClient({_ARN: {"neon_dsn": "postgresql://user:pw@host/db"}})
    monkeypatch.setattr(
        "sanposcape.integrations.aws.secrets.boto3.client", lambda service_name: fake_client
    )

    result = get_secret_json(_ARN)

    assert result == {"neon_dsn": "postgresql://user:pw@host/db"}
    assert fake_client.calls == [_ARN]


def test_get_secret_json_is_cached_per_arn(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_client = _FakeSecretsManagerClient({_ARN: {"neon_dsn": "postgresql://user:pw@host/db"}})
    monkeypatch.setattr(
        "sanposcape.integrations.aws.secrets.boto3.client", lambda service_name: fake_client
    )

    get_secret_json(_ARN)
    get_secret_json(_ARN)

    assert fake_client.calls == [_ARN]  # 2 回目は API を呼ばずキャッシュから返す


def test_resource_not_found_is_logged_without_secret_and_reraised(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    error = ClientError(
        {"Error": {"Code": "ResourceNotFoundException", "Message": "not found"}},
        "GetSecretValue",
    )
    fake_client = _FakeSecretsManagerClient(error=error)
    monkeypatch.setattr(
        "sanposcape.integrations.aws.secrets.boto3.client", lambda service_name: fake_client
    )

    with (
        caplog.at_level(logging.ERROR, logger="sanposcape.integrations.aws.secrets"),
        pytest.raises(ClientError),
    ):
        get_secret_json(_ARN)

    assert any("ResourceNotFoundException" in r.getMessage() for r in caplog.records)
    # ARN そのものはログに出さない
    assert all(_ARN not in r.getMessage() for r in caplog.records)


def test_other_client_errors_propagate_without_resource_not_found_log(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    error = ClientError(
        {"Error": {"Code": "AccessDeniedException", "Message": "denied"}},
        "GetSecretValue",
    )
    fake_client = _FakeSecretsManagerClient(error=error)
    monkeypatch.setattr(
        "sanposcape.integrations.aws.secrets.boto3.client", lambda service_name: fake_client
    )

    with (
        caplog.at_level(logging.ERROR, logger="sanposcape.integrations.aws.secrets"),
        pytest.raises(ClientError),
    ):
        get_secret_json(_ARN)

    assert not any("ResourceNotFoundException" in r.getMessage() for r in caplog.records)

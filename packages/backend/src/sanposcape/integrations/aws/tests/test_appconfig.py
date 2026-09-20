import io
import json
import logging
from typing import Any

import boto3
import pytest
from botocore.exceptions import ClientError
from botocore.response import StreamingBody
from botocore.stub import Stubber

from sanposcape.config import Settings
from sanposcape.integrations.aws.appconfig import (
    AppConfigFlagSource,
    FlagDocument,
    StubFlagSource,
    UnconfiguredFlagSource,
    build_flag_document_source,
)

_APPLICATION_ID = "app-1"
_ENVIRONMENT_ID = "env-1"
_PROFILE_ID = "profile-1"


def _settings(**overrides: Any) -> Settings:
    return Settings(
        appconfig_application_id=_APPLICATION_ID,
        appconfig_environment_id=_ENVIRONMENT_ID,
        appconfig_configuration_profile_id=_PROFILE_ID,
        **overrides,
    )


def _body(data: dict[str, Any] | bytes) -> StreamingBody:
    raw = data if isinstance(data, bytes) else json.dumps(data).encode("utf-8")
    return StreamingBody(io.BytesIO(raw), len(raw))


class _FakeAppConfigDataClient:
    """boto3 appconfigdata クライアントの最小限のスタブ（手書きフェイク）。

    `test_secrets.py` の `_FakeSecretsManagerClient` と同じ流儀。呼び出し順・引数は
    `calls` に記録して分岐網羅を検証する。パラメータ名そのものの正しさは
    `test_build_flag_document_source_and_boto3_parameter_names` の Stubber テストで別途固定する。
    """

    def __init__(self) -> None:
        self.calls: list[tuple[str, dict[str, Any]]] = []
        self._start_responses: list[Any] = []
        self._get_responses: list[Any] = []
        self._next_token_suffix = 0

    def queue_start_response(self, response: Any) -> None:
        self._start_responses.append(response)

    def queue_get_response(self, response: Any) -> None:
        self._get_responses.append(response)

    def start_configuration_session(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("start", kwargs))
        response = self._start_responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    def get_latest_configuration(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("get", kwargs))
        response = self._get_responses.pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    def _next_token(self) -> str:
        self._next_token_suffix += 1
        return f"token-{self._next_token_suffix}"


def _client_error(code: str, operation: str = "GetLatestConfiguration") -> ClientError:
    return ClientError({"Error": {"Code": code, "Message": code}}, operation)


def test_initial_fetch_starts_session_then_gets_configuration() -> None:
    fake_client = _FakeAppConfigDataClient()
    fake_client.queue_start_response({"InitialConfigurationToken": "token-1"})
    fake_client.queue_get_response(
        {
            "NextPollConfigurationToken": "token-2",
            "NextPollIntervalInSeconds": 60,
            "Configuration": _body({"app_config_probe": {"enabled": True}}),
        }
    )
    now = [0.0]
    source = AppConfigFlagSource(_settings(), client=fake_client, now=lambda: now[0])

    document = source.get_document()

    assert document == FlagDocument({"app_config_probe": {"enabled": True}}, kind="appconfig")
    assert [call[0] for call in fake_client.calls] == ["start", "get"]
    start_kwargs = fake_client.calls[0][1]
    assert start_kwargs["ApplicationIdentifier"] == _APPLICATION_ID
    assert start_kwargs["EnvironmentIdentifier"] == _ENVIRONMENT_ID
    assert start_kwargs["ConfigurationProfileIdentifier"] == _PROFILE_ID
    assert fake_client.calls[1][1]["ConfigurationToken"] == "token-1"


def test_second_call_within_poll_interval_does_not_call_api() -> None:
    fake_client = _FakeAppConfigDataClient()
    fake_client.queue_start_response({"InitialConfigurationToken": "token-1"})
    fake_client.queue_get_response(
        {
            "NextPollConfigurationToken": "token-2",
            "NextPollIntervalInSeconds": 60,
            "Configuration": _body({}),
        }
    )
    now = [0.0]
    source = AppConfigFlagSource(_settings(), client=fake_client, now=lambda: now[0])

    source.get_document()
    call_count_after_first = len(fake_client.calls)
    now[0] = 10.0  # まだ間隔（60秒）内
    source.get_document()

    assert len(fake_client.calls) == call_count_after_first


def test_call_after_poll_interval_reuses_token_without_starting_new_session() -> None:
    fake_client = _FakeAppConfigDataClient()
    fake_client.queue_start_response({"InitialConfigurationToken": "token-1"})
    fake_client.queue_get_response(
        {
            "NextPollConfigurationToken": "token-2",
            "NextPollIntervalInSeconds": 60,
            "Configuration": _body({"app_config_probe": {"enabled": False}}),
        }
    )
    fake_client.queue_get_response(
        {
            "NextPollConfigurationToken": "token-3",
            "NextPollIntervalInSeconds": 60,
            "Configuration": _body({"app_config_probe": {"enabled": True}}),
        }
    )
    now = [0.0]
    source = AppConfigFlagSource(_settings(), client=fake_client, now=lambda: now[0])

    source.get_document()
    now[0] = 100.0  # 間隔経過後
    document = source.get_document()

    assert [call[0] for call in fake_client.calls] == ["start", "get", "get"]
    # Start は呼ばれず、前回の NextPollConfigurationToken が渡っている。
    assert fake_client.calls[2][1]["ConfigurationToken"] == "token-2"
    assert document.values == {"app_config_probe": {"enabled": True}}


def test_empty_body_on_unchanged_configuration_keeps_previous_document() -> None:
    fake_client = _FakeAppConfigDataClient()
    fake_client.queue_start_response({"InitialConfigurationToken": "token-1"})
    fake_client.queue_get_response(
        {
            "NextPollConfigurationToken": "token-2",
            "NextPollIntervalInSeconds": 60,
            "Configuration": _body({"app_config_probe": {"enabled": True}}),
        }
    )
    fake_client.queue_get_response(
        {
            "NextPollConfigurationToken": "token-3",
            "NextPollIntervalInSeconds": 60,
            "Configuration": _body(b""),  # 変化なし
        }
    )
    now = [0.0]
    source = AppConfigFlagSource(_settings(), client=fake_client, now=lambda: now[0])

    first = source.get_document()
    now[0] = 100.0
    second = source.get_document()

    assert second == first
    assert second.kind == "appconfig"


def test_empty_body_on_first_fetch_is_treated_as_not_yet_deployed(
    caplog: pytest.LogCaptureFixture,
) -> None:
    fake_client = _FakeAppConfigDataClient()
    fake_client.queue_start_response({"InitialConfigurationToken": "token-1"})
    fake_client.queue_get_response(
        {
            "NextPollConfigurationToken": "token-2",
            "NextPollIntervalInSeconds": 60,
            "Configuration": _body(b""),
        }
    )
    now = [0.0]
    source = AppConfigFlagSource(_settings(), client=fake_client, now=lambda: now[0])

    with caplog.at_level(logging.INFO, logger="sanposcape.integrations.aws.appconfig"):
        document = source.get_document()

    assert document == FlagDocument({}, kind="default")
    assert not any(record.levelno >= logging.ERROR for record in caplog.records)
    assert any("no deployed configuration" in record.getMessage() for record in caplog.records)

    # 次の間隔までは再取得しない。
    now[0] = 1.0
    source.get_document()
    assert [call[0] for call in fake_client.calls] == ["start", "get"]


def test_malformed_json_keeps_previous_document_and_logs_error(
    caplog: pytest.LogCaptureFixture,
) -> None:
    fake_client = _FakeAppConfigDataClient()
    fake_client.queue_start_response({"InitialConfigurationToken": "token-1"})
    fake_client.queue_get_response(
        {
            "NextPollConfigurationToken": "token-2",
            "NextPollIntervalInSeconds": 60,
            "Configuration": _body({"app_config_probe": {"enabled": True}}),
        }
    )
    fake_client.queue_get_response(
        {
            "NextPollConfigurationToken": "token-3",
            "NextPollIntervalInSeconds": 60,
            "Configuration": _body(b"{not valid json"),
        }
    )
    now = [0.0]
    source = AppConfigFlagSource(_settings(), client=fake_client, now=lambda: now[0])

    first = source.get_document()
    now[0] = 100.0
    with caplog.at_level(logging.ERROR, logger="sanposcape.integrations.aws.appconfig"):
        second = source.get_document()

    assert second == first  # 例外は伝播せず、前回値を保持する
    assert any(record.levelno == logging.ERROR for record in caplog.records)


def test_malformed_json_without_previous_document_falls_back_to_default() -> None:
    fake_client = _FakeAppConfigDataClient()
    fake_client.queue_start_response({"InitialConfigurationToken": "token-1"})
    fake_client.queue_get_response(
        {
            "NextPollConfigurationToken": "token-2",
            "NextPollIntervalInSeconds": 60,
            "Configuration": _body(b"{not valid json"),
        }
    )
    now = [0.0]
    source = AppConfigFlagSource(_settings(), client=fake_client, now=lambda: now[0])

    document = source.get_document()

    assert document == FlagDocument({}, kind="default")


def test_bad_request_exception_restarts_session_and_retries_once() -> None:
    fake_client = _FakeAppConfigDataClient()
    fake_client.queue_start_response({"InitialConfigurationToken": "token-1"})
    fake_client.queue_get_response(_client_error("BadRequestException"))
    fake_client.queue_start_response({"InitialConfigurationToken": "token-2"})
    fake_client.queue_get_response(
        {
            "NextPollConfigurationToken": "token-3",
            "NextPollIntervalInSeconds": 60,
            "Configuration": _body({"app_config_probe": {"enabled": True}}),
        }
    )
    now = [0.0]
    source = AppConfigFlagSource(_settings(), client=fake_client, now=lambda: now[0])

    document = source.get_document()

    assert document.values == {"app_config_probe": {"enabled": True}}
    assert [call[0] for call in fake_client.calls] == ["start", "get", "start", "get"]


def test_client_error_falls_back_to_previous_document_and_backs_off() -> None:
    fake_client = _FakeAppConfigDataClient()
    fake_client.queue_start_response({"InitialConfigurationToken": "token-1"})
    fake_client.queue_get_response(
        {
            "NextPollConfigurationToken": "token-2",
            "NextPollIntervalInSeconds": 60,
            "Configuration": _body({"app_config_probe": {"enabled": True}}),
        }
    )
    fake_client.queue_get_response(_client_error("AccessDeniedException"))
    fake_client.queue_get_response(
        {
            "NextPollConfigurationToken": "token-3",
            "NextPollIntervalInSeconds": 60,
            "Configuration": _body({"app_config_probe": {"enabled": True}}),
        }
    )
    now = [0.0]
    settings = _settings(appconfig_error_backoff_seconds=30)
    source = AppConfigFlagSource(settings, client=fake_client, now=lambda: now[0])

    first = source.get_document()
    now[0] = 100.0  # ポーリング間隔（60秒）は経過したので再取得を試みる
    second = source.get_document()

    assert second == first  # 失敗時は前回値を維持
    assert len(fake_client.calls) == 3  # start, get(success), get(failure)

    # バックオフ中は API を呼ばない。
    now[0] = 105.0
    source.get_document()
    assert len(fake_client.calls) == 3

    # バックオフ経過後は再取得する。
    now[0] = 100.0 + 30.0 + 1.0
    source.get_document()
    assert len(fake_client.calls) == 4


def test_missing_initial_configuration_token_falls_back_to_default_without_raising() -> None:
    """`get_document()` は「絶対に例外を送出しない」不変条件を持つ。

    AppConfig のレスポンスから `InitialConfigurationToken` が欠けているという
    本来起きないはずの応答異常でも、素の `[]` アクセスなら `KeyError` が呼び出し元
    （`/app-config`）まで伝播してしまう。`.get()` + 明示チェックで `ValueError` に
    正規化し、他の取得失敗と同じフォールバック経路に倒れることを固定する。
    """
    fake_client = _FakeAppConfigDataClient()
    fake_client.queue_start_response({})  # InitialConfigurationToken が無い
    now = [0.0]
    source = AppConfigFlagSource(_settings(), client=fake_client, now=lambda: now[0])

    document = source.get_document()

    assert document == FlagDocument({}, kind="default")


def test_missing_next_poll_configuration_token_falls_back_without_raising() -> None:
    fake_client = _FakeAppConfigDataClient()
    fake_client.queue_start_response({"InitialConfigurationToken": "token-1"})
    fake_client.queue_get_response(
        {
            # NextPollConfigurationToken が無い
            "NextPollIntervalInSeconds": 60,
            "Configuration": _body({"app_config_probe": {"enabled": True}}),
        }
    )
    now = [0.0]
    source = AppConfigFlagSource(_settings(), client=fake_client, now=lambda: now[0])

    document = source.get_document()

    assert document == FlagDocument({}, kind="default")


def test_missing_configuration_key_falls_back_without_raising(
    caplog: pytest.LogCaptureFixture,
) -> None:
    fake_client = _FakeAppConfigDataClient()
    fake_client.queue_start_response({"InitialConfigurationToken": "token-1"})
    fake_client.queue_get_response(
        {
            "NextPollConfigurationToken": "token-2",
            "NextPollIntervalInSeconds": 60,
            # Configuration が無い
        }
    )
    now = [0.0]
    source = AppConfigFlagSource(_settings(), client=fake_client, now=lambda: now[0])

    with caplog.at_level(logging.ERROR, logger="sanposcape.integrations.aws.appconfig"):
        document = source.get_document()

    assert document == FlagDocument({}, kind="default")
    assert any(record.levelno == logging.ERROR for record in caplog.records)


def test_resource_not_found_exception_is_treated_as_default_with_backoff() -> None:
    fake_client = _FakeAppConfigDataClient()
    fake_client.queue_start_response({"InitialConfigurationToken": "token-1"})
    fake_client.queue_get_response(_client_error("ResourceNotFoundException"))
    now = [0.0]
    source = AppConfigFlagSource(_settings(), client=fake_client, now=lambda: now[0])

    document = source.get_document()

    assert document == FlagDocument({}, kind="default")
    call_count = len(fake_client.calls)
    now[0] = 1.0  # バックオフ中
    source.get_document()
    assert len(fake_client.calls) == call_count


def test_close_does_not_close_an_injected_client() -> None:
    """テストが差し替えたフェイククライアント（`close()` を持たない）は close しない。
    `_owns_client` は「自分で boto3.client() を呼んで作った場合だけ」を表す
    （`HttpGoogleMapsProvider` と同じ流儀。local-review F-13）。
    """
    fake_client = _FakeAppConfigDataClient()  # close() を持たない
    source = AppConfigFlagSource(_settings(), client=fake_client)

    source.close()  # AttributeError が出ないことそのものがアサーション


def test_close_closes_a_client_it_created_itself(monkeypatch: pytest.MonkeyPatch) -> None:
    closed: list[bool] = []

    class _FakeBotoClient:
        def close(self) -> None:
            closed.append(True)

    monkeypatch.setattr(
        "sanposcape.integrations.aws.appconfig.boto3.client", lambda *a, **k: _FakeBotoClient()
    )
    source = AppConfigFlagSource(_settings())

    source.close()

    assert closed == [True]


@pytest.mark.parametrize(
    "mode, application_id, environment_id, profile_id, expected_type",
    [
        ("stub", "", "", "", StubFlagSource),
        ("real", "", "env", "profile", UnconfiguredFlagSource),
        ("real", "app", "", "profile", UnconfiguredFlagSource),
        ("real", "app", "env", "", UnconfiguredFlagSource),
        ("real", "app", "env", "profile", AppConfigFlagSource),
    ],
)
def test_build_flag_document_source_picks_implementation_by_mode_and_ids(
    mode: str,
    application_id: str,
    environment_id: str,
    profile_id: str,
    expected_type: type,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # AppConfigFlagSource が実際に boto3.client() を呼んで外へ出ないよう差し替える。
    monkeypatch.setattr(
        "sanposcape.integrations.aws.appconfig.boto3.client", lambda *a, **k: object()
    )
    settings = Settings(
        feature_flag_mode=mode,
        appconfig_application_id=application_id,
        appconfig_environment_id=environment_id,
        appconfig_configuration_profile_id=profile_id,
    )

    source = build_flag_document_source(settings)

    assert isinstance(source, expected_type)


def test_build_flag_document_source_logs_warning_when_unconfigured_in_local_or_test(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """local/test で `APPCONFIG_*` 未設定は既存開発者の .env や CI で最も起きやすい
    正常経路（`UnconfiguredFlagSource` は AWS を一切呼ばない）なので WARNING に留める。
    ERROR のままだと pytest 実行のたびにログが積み上がり、ERROR ベースのアラームの
    誤検知の温床になる（local-review F-2）。
    """
    settings = Settings(env="test")

    with caplog.at_level(logging.WARNING, logger="sanposcape.integrations.aws.appconfig"):
        build_flag_document_source(settings)

    assert any(
        record.levelno == logging.WARNING and "APPCONFIG_*" in record.getMessage()
        for record in caplog.records
    )
    assert not any(record.levelno >= logging.ERROR for record in caplog.records)


def test_build_flag_document_source_logs_error_when_unconfigured_outside_local_or_test(
    caplog: pytest.LogCaptureFixture,
) -> None:
    """staging/production では設定漏れの検知性を保つため ERROR のままにする。"""
    settings = Settings(
        env="staging",
        auth_mode="real",
        auth_jwt_secret="x" * 32,
        google_allowed_audiences=["aud"],
        google_maps_server_api_key="test-server-key",
        database_dsn="postgres://user:pw@host.example.com/db",
    )

    with caplog.at_level(logging.ERROR, logger="sanposcape.integrations.aws.appconfig"):
        build_flag_document_source(settings)

    assert any(
        record.levelno == logging.ERROR and "APPCONFIG_*" in record.getMessage()
        for record in caplog.records
    )


def test_build_flag_document_source_stub_reads_stub_document() -> None:
    settings = Settings(
        feature_flag_mode="stub",
        feature_flag_stub_document=json.dumps({"app_config_probe": {"enabled": True}}),
    )

    source = build_flag_document_source(settings)

    assert source.get_document() == FlagDocument(
        {"app_config_probe": {"enabled": True}}, kind="stub"
    )


def test_stub_flag_source_falls_back_to_empty_document_on_invalid_json() -> None:
    source = StubFlagSource(Settings(feature_flag_stub_document="{not valid"))
    assert source.get_document() == FlagDocument({}, kind="stub")


def test_stub_flag_source_falls_back_to_empty_document_on_non_object_json() -> None:
    source = StubFlagSource(Settings(feature_flag_stub_document="[1, 2, 3]"))
    assert source.get_document() == FlagDocument({}, kind="stub")


def test_stub_flag_source_defaults_to_empty_document() -> None:
    source = StubFlagSource(Settings(feature_flag_stub_document=""))
    assert source.get_document() == FlagDocument({}, kind="stub")


def test_unconfigured_flag_source_returns_default_document() -> None:
    source = UnconfiguredFlagSource()
    assert source.get_document() == FlagDocument({}, kind="default")


def test_boto3_client_calls_use_the_real_api_parameter_names() -> None:
    """手書きフェイクはキー名の typo を検出できない（実 API でしか落ちない）ため、
    ここだけ botocore.stub.Stubber で実際の boto3 モデルとの一致を固定する
    （プラン §テスト方針 #11）。
    """
    client = boto3.client(
        "appconfigdata",
        region_name="ap-southeast-1",
        aws_access_key_id="test",
        aws_secret_access_key="test",
    )
    stubber = Stubber(client)
    stubber.add_response(
        "start_configuration_session",
        {"InitialConfigurationToken": "token-1"},
        {
            "ApplicationIdentifier": _APPLICATION_ID,
            "EnvironmentIdentifier": _ENVIRONMENT_ID,
            "ConfigurationProfileIdentifier": _PROFILE_ID,
            "RequiredMinimumPollIntervalInSeconds": 60,
        },
    )
    stubber.add_response(
        "get_latest_configuration",
        {
            "NextPollConfigurationToken": "token-2",
            "NextPollIntervalInSeconds": 60,
            "Configuration": _body({"app_config_probe": {"enabled": True}}),
        },
        {"ConfigurationToken": "token-1"},
    )
    stubber.activate()
    now = [0.0]
    source = AppConfigFlagSource(_settings(), client=client, now=lambda: now[0])

    document = source.get_document()

    stubber.assert_no_pending_responses()
    assert document.values == {"app_config_probe": {"enabled": True}}

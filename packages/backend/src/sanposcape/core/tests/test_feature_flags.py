import logging
from typing import Any

import pytest

from sanposcape.core.feature_flags import (
    FEATURE_FLAGS,
    FLAG_KEY_PATTERN,
    RESERVED_FLAG_KEYS,
    FeatureFlags,
    MinimumSupportedVersions,
)
from sanposcape.integrations.aws.appconfig import FlagDocument


class _FakeFlagDocumentSource:
    def __init__(self, values: dict[str, Any], kind: str = "appconfig") -> None:
        self._document = FlagDocument(values, kind=kind)  # type: ignore[arg-type]

    def get_document(self) -> FlagDocument:
        return self._document


# --- 登録簿の不変条件 ---


def test_all_flag_keys_match_the_key_pattern() -> None:
    for spec in FEATURE_FLAGS:
        assert FLAG_KEY_PATTERN.match(spec.key), spec.key


def test_no_flag_key_collides_with_a_reserved_key() -> None:
    keys = {spec.key for spec in FEATURE_FLAGS}
    assert keys.isdisjoint(RESERVED_FLAG_KEYS)


def test_flag_keys_have_no_duplicates() -> None:
    keys = [spec.key for spec in FEATURE_FLAGS]
    assert len(keys) == len(set(keys))


def test_all_flag_audiences_are_valid() -> None:
    for spec in FEATURE_FLAGS:
        assert spec.audience in ("client", "backend")


# --- client_flags() ---


def test_client_flags_includes_registered_client_flags_missing_from_appconfig() -> None:
    flags = FeatureFlags(_FakeFlagDocumentSource({}))
    result = flags.client_flags()
    assert result == {spec.key: False for spec in FEATURE_FLAGS if spec.audience == "client"}


def test_client_flags_reflects_appconfig_value() -> None:
    flags = FeatureFlags(_FakeFlagDocumentSource({"app_config_probe": {"enabled": True}}))
    assert flags.client_flags()["app_config_probe"] is True


def test_client_flags_excludes_backend_only_flags(monkeypatch: pytest.MonkeyPatch) -> None:
    from sanposcape.core import feature_flags as feature_flags_module

    backend_only = feature_flags_module.FeatureFlagSpec(
        key="backend_only_flag", description="test", audience="backend"
    )
    monkeypatch.setattr(feature_flags_module, "FEATURE_FLAGS", (*FEATURE_FLAGS, backend_only))
    flags = FeatureFlags(_FakeFlagDocumentSource({"backend_only_flag": {"enabled": True}}))
    assert "backend_only_flag" not in flags.client_flags()


def test_client_flags_ignores_unknown_appconfig_keys() -> None:
    flags = FeatureFlags(
        _FakeFlagDocumentSource(
            {
                "app_config_probe": {"enabled": False},
                "some_future_flag_not_yet_deployed": {"enabled": True},
            }
        )
    )
    assert "some_future_flag_not_yet_deployed" not in flags.client_flags()


def test_client_flags_treats_non_bool_string_enabled_value_as_off(
    caplog: pytest.LogCaptureFixture,
) -> None:
    flags = FeatureFlags(_FakeFlagDocumentSource({"app_config_probe": {"enabled": "true"}}))
    with caplog.at_level(logging.WARNING, logger="sanposcape.core.feature_flags"):
        result = flags.client_flags()
    assert result["app_config_probe"] is False
    assert any(record.levelno == logging.WARNING for record in caplog.records)


def test_client_flags_treats_non_dict_flag_value_as_off(
    caplog: pytest.LogCaptureFixture,
) -> None:
    flags = FeatureFlags(_FakeFlagDocumentSource({"app_config_probe": True}))
    with caplog.at_level(logging.WARNING, logger="sanposcape.core.feature_flags"):
        result = flags.client_flags()
    assert result["app_config_probe"] is False
    assert any(record.levelno == logging.WARNING for record in caplog.records)


# --- minimum_supported_versions() ---


def test_minimum_supported_versions_parses_valid_versions() -> None:
    flags = FeatureFlags(
        _FakeFlagDocumentSource(
            {
                "client_requirements": {
                    "enabled": True,
                    "ios_minimum_version": "1.2.3",
                    "android_minimum_version": "1.2.4",
                }
            }
        )
    )
    assert flags.minimum_supported_versions() == MinimumSupportedVersions(
        ios="1.2.3", android="1.2.4"
    )


def test_minimum_supported_versions_is_none_when_client_requirements_missing() -> None:
    flags = FeatureFlags(_FakeFlagDocumentSource({}))
    assert flags.minimum_supported_versions() == MinimumSupportedVersions(ios=None, android=None)


def test_minimum_supported_versions_is_none_when_client_requirements_disabled() -> None:
    """AWS AppConfig の仕様: enabled=false のフラグの属性は配信されない。
    OFF なら属性が無い/読めないため、安全側（強制アップデートしない）に倒す。
    """
    flags = FeatureFlags(
        _FakeFlagDocumentSource(
            {
                "client_requirements": {
                    "enabled": False,
                    "ios_minimum_version": "1.2.3",
                    "android_minimum_version": "1.2.4",
                }
            }
        )
    )
    assert flags.minimum_supported_versions() == MinimumSupportedVersions(ios=None, android=None)


@pytest.mark.parametrize("invalid_version", ["1.0", "abc", "1.0.0.0", "", None])
def test_minimum_supported_versions_is_none_for_malformed_version(
    invalid_version: str | None, caplog: pytest.LogCaptureFixture
) -> None:
    flags = FeatureFlags(
        _FakeFlagDocumentSource(
            {
                "client_requirements": {
                    "enabled": True,
                    "ios_minimum_version": invalid_version,
                    "android_minimum_version": "1.0.0",
                }
            }
        )
    )
    with caplog.at_level(logging.WARNING, logger="sanposcape.core.feature_flags"):
        result = flags.minimum_supported_versions()
    assert result.ios is None
    assert result.android == "1.0.0"


# --- is_enabled() ---


def test_is_enabled_returns_false_for_unregistered_key(caplog: pytest.LogCaptureFixture) -> None:
    flags = FeatureFlags(_FakeFlagDocumentSource({"typo_key": {"enabled": True}}))
    with caplog.at_level(logging.WARNING, logger="sanposcape.core.feature_flags"):
        result = flags.is_enabled("typo_key")
    assert result is False
    assert any(record.levelno == logging.WARNING for record in caplog.records)


def test_is_enabled_returns_registered_flag_value() -> None:
    flags = FeatureFlags(_FakeFlagDocumentSource({"app_config_probe": {"enabled": True}}))
    assert flags.is_enabled("app_config_probe") is True


# --- source_kind() ---


@pytest.mark.parametrize("kind", ["appconfig", "default", "stub"])
def test_source_kind_reflects_document_kind(kind: str) -> None:
    flags = FeatureFlags(_FakeFlagDocumentSource({}, kind=kind))
    assert flags.source_kind() == kind

import logging
from typing import Any

import pytest

from sanposcape.core import feature_flags as feature_flags_module
from sanposcape.core.feature_flags import (
    FEATURE_FLAGS,
    FIXED_CLIENT_FLAGS,
    FLAG_KEY_PATTERN,
    RESERVED_FLAG_KEYS,
    FeatureFlags,
    FeatureFlagSpec,
    MinimumSupportedVersions,
)
from sanposcape.integrations.aws.appconfig import FlagDocument

SAMPLE_FLAG = "sample_flag"


@pytest.fixture(autouse=True)
def sample_registry(monkeypatch: pytest.MonkeyPatch) -> None:
    """通常のフラグの挙動は、テスト用のフラグ1本の登録簿で確かめる（本物の登録簿は空のことがある）。"""
    spec = FeatureFlagSpec(key=SAMPLE_FLAG, description="test", audience="client")
    monkeypatch.setattr(feature_flags_module, "FEATURE_FLAGS", (spec,))
    monkeypatch.setattr(feature_flags_module, "_FLAGS_BY_KEY", {SAMPLE_FLAG: spec})


class _FakeFlagDocumentSource:
    def __init__(self, values: dict[str, Any], kind: str = "appconfig") -> None:
        self._document = FlagDocument(values, kind=kind)  # type: ignore[arg-type]
        self.call_count = 0

    def get_document(self) -> FlagDocument:
        self.call_count += 1
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


def test_fixed_flag_keys_match_the_key_pattern_and_collide_with_nothing() -> None:
    """固定値のキー（ADR-008 D40）は、登録簿・予約キーと重ならない（値の出どころが2つになる）。"""
    for key in FIXED_CLIENT_FLAGS:
        assert FLAG_KEY_PATTERN.match(key), key
    assert FIXED_CLIENT_FLAGS.isdisjoint({spec.key for spec in FEATURE_FLAGS})
    assert FIXED_CLIENT_FLAGS.isdisjoint(RESERVED_FLAG_KEYS)


def test_fixed_flags_include_the_flags_retired_in_ss_271() -> None:
    """1.0.0・1.1.0 がこのキーで機能を出し分けている。

    段階2 の前に消すと、配布済みのアプリから機能が消える。
    """
    assert {
        "pin_registration",
        "pin_station_tag",
        "map_invitation",
        "map_pin_visibility",
        "display_name_edit",
    } <= FIXED_CLIENT_FLAGS


# --- client_flags() ---


def test_client_flags_includes_registered_client_flags_missing_from_appconfig() -> None:
    flags = FeatureFlags(_FakeFlagDocumentSource({}))
    result = flags.client_flags()
    assert result == {SAMPLE_FLAG: False, **dict.fromkeys(FIXED_CLIENT_FLAGS, True)}


def test_client_flags_reflects_appconfig_value() -> None:
    flags = FeatureFlags(_FakeFlagDocumentSource({SAMPLE_FLAG: {"enabled": True}}))
    assert flags.client_flags()[SAMPLE_FLAG] is True


def test_client_flags_excludes_backend_only_flags(monkeypatch: pytest.MonkeyPatch) -> None:
    backend_only = FeatureFlagSpec(key="backend_only_flag", description="test", audience="backend")
    monkeypatch.setattr(
        feature_flags_module,
        "FEATURE_FLAGS",
        (*feature_flags_module.FEATURE_FLAGS, backend_only),
    )
    flags = FeatureFlags(_FakeFlagDocumentSource({"backend_only_flag": {"enabled": True}}))
    assert "backend_only_flag" not in flags.client_flags()


def test_client_flags_ignores_unknown_appconfig_keys() -> None:
    flags = FeatureFlags(
        _FakeFlagDocumentSource(
            {
                SAMPLE_FLAG: {"enabled": False},
                "some_future_flag_not_yet_deployed": {"enabled": True},
            }
        )
    )
    assert "some_future_flag_not_yet_deployed" not in flags.client_flags()


@pytest.mark.parametrize("kind", ["appconfig", "default", "stub"])
def test_client_flags_returns_fixed_flags_as_true_whatever_appconfig_says(kind: str) -> None:
    """固定値は AppConfig の値・取得の状態（一度も取得できていない `default`）に関わらず True
    （ADR-008 SS-233 追補 D40。決定9 の全 OFF より優先する）。
    """
    key = sorted(FIXED_CLIENT_FLAGS)[0]
    flags = FeatureFlags(_FakeFlagDocumentSource({key: {"enabled": False}}, kind=kind))

    result = flags.client_flags()

    assert all(result[fixed] is True for fixed in FIXED_CLIENT_FLAGS)


def test_is_enabled_returns_true_for_fixed_flags() -> None:
    key = sorted(FIXED_CLIENT_FLAGS)[0]
    flags = FeatureFlags(_FakeFlagDocumentSource({}, kind="default"))
    assert flags.is_enabled(key) is True


def test_client_flags_treats_non_bool_string_enabled_value_as_off(
    caplog: pytest.LogCaptureFixture,
) -> None:
    flags = FeatureFlags(_FakeFlagDocumentSource({SAMPLE_FLAG: {"enabled": "true"}}))
    with caplog.at_level(logging.WARNING, logger="sanposcape.core.feature_flags"):
        result = flags.client_flags()
    assert result[SAMPLE_FLAG] is False
    assert any(record.levelno == logging.WARNING for record in caplog.records)


def test_client_flags_treats_non_dict_flag_value_as_off(
    caplog: pytest.LogCaptureFixture,
) -> None:
    flags = FeatureFlags(_FakeFlagDocumentSource({SAMPLE_FLAG: True}))
    with caplog.at_level(logging.WARNING, logger="sanposcape.core.feature_flags"):
        result = flags.client_flags()
    assert result[SAMPLE_FLAG] is False
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
    flags = FeatureFlags(_FakeFlagDocumentSource({SAMPLE_FLAG: {"enabled": True}}))
    assert flags.is_enabled(SAMPLE_FLAG) is True


# --- source_kind() ---


@pytest.mark.parametrize("kind", ["appconfig", "default", "stub"])
def test_source_kind_reflects_document_kind(kind: str) -> None:
    flags = FeatureFlags(_FakeFlagDocumentSource({}, kind=kind))
    assert flags.source_kind() == kind


# --- get_document() の使い回し（local-review F-12） ---


def test_get_document_delegates_to_source() -> None:
    source = _FakeFlagDocumentSource({SAMPLE_FLAG: {"enabled": True}})
    flags = FeatureFlags(source)
    assert flags.get_document() == FlagDocument({SAMPLE_FLAG: {"enabled": True}}, kind="appconfig")
    assert source.call_count == 1


def test_client_flags_minimum_supported_versions_and_source_kind_accept_a_shared_document() -> None:
    """呼び出し元が `get_document()` を1回だけ呼び、その結果を明示的に渡した場合は
    `FlagDocumentSource.get_document()` を再度呼ばないことを固定する
    （router 側の呼び出し回数削減が実際に効いていることの土台）。
    """
    source = _FakeFlagDocumentSource(
        {
            SAMPLE_FLAG: {"enabled": True},
            "client_requirements": {
                "enabled": True,
                "ios_minimum_version": "1.2.3",
                "android_minimum_version": "1.2.4",
            },
        }
    )
    flags = FeatureFlags(source)

    document = flags.get_document()
    assert source.call_count == 1

    flags.client_flags(document)
    flags.minimum_supported_versions(document)
    flags.source_kind(document)
    flags.is_enabled(SAMPLE_FLAG, document)

    assert source.call_count == 1

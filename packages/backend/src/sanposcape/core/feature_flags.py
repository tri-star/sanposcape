"""フィーチャーフラグの評価層（ドメイン横断の土台）。

「AppConfig からどう取るか」（`integrations/aws/appconfig.py`）と「どのキーが存在し、
どれをクライアントに見せるか」（ここ）は変更理由が別のため分離する（folder-structure.md、
ADR-008 追補 D3。SS-98）。

`FlagDocument` / `FlagDocumentSource`（下で import している型）を `core` 側ではなく
`integrations/aws/appconfig.py` 側に置いているのは、**循環 import になるから**ではない
（`FlagDocumentSource` は `Protocol` なので構造的部分型が効き、core 側に置いても
`integrations → core` に依存の向きが反転するだけで循環にはならない。技術的にはどちらの
配置も可能）。`core/runtime_config.py → integrations/aws/secrets.py` という既存の依存の
向きとの一貫性を優先した設計判断であり、詳細は ADR-008 追補 D3 を参照。

フラグの「クライアント公開可否」の正典はこのモジュールの `FEATURE_FLAGS`（本リポジトリの
コード）が持つ。AppConfig 側の JSON は `AWS.AppConfig.FeatureFlags` の型で
`additionalProperties: false`（独自メタ情報を置けない）ため、値の切替操作で内部専用フラグが
露出する事故を構造的に防ぐ（ADR-008 追補 D9）。AppConfig は値（ON/OFF）だけを持つ。
"""

import logging
import re
from dataclasses import dataclass
from typing import Literal

from sanposcape.integrations.aws.appconfig import FlagDocument, FlagDocumentSource

logger = logging.getLogger(__name__)

FLAG_KEY_PATTERN = re.compile(r"^[a-z][a-zA-Z\d_-]{0,63}$")

# `client_requirements` はフィーチャーフラグではなく、最低サポートバージョンを属性として
# 配る予約キー（ADR-008 追補 D7）。`FEATURE_FLAGS` には登録しない。
RESERVED_FLAG_KEYS = frozenset({"client_requirements"})

_VERSION_PATTERN = re.compile(r"^\d+\.\d+\.\d+$")

FlagAudience = Literal["client", "backend"]


@dataclass(frozen=True)
class FeatureFlagSpec:
    """フラグの正典（キー・説明・公開範囲）。

    値（ON/OFF）を表す `default` フィールドを意図的に持たない。既定は常に OFF
    （AppConfig 未配信・取得失敗時のフェイルセーフ、ADR-008 決定9）であり、
    フィールドを作らないことでこれを構造として担保する。
    """

    key: str
    description: str
    audience: FlagAudience


FEATURE_FLAGS: tuple[FeatureFlagSpec, ...] = (
    FeatureFlagSpec(
        key="app_config_probe",
        description=(
            "基盤の疎通確認用フラグ。機能には紐づかない。"
            "最初の実フラグが入った時点で削除する（ADR-008 決定6）。"
        ),
        audience="client",
    ),
)


def _validate_registry() -> None:
    seen: set[str] = set()
    for spec in FEATURE_FLAGS:
        if not FLAG_KEY_PATTERN.match(spec.key):
            raise ValueError(f"Invalid feature flag key: {spec.key!r}")
        if spec.key in RESERVED_FLAG_KEYS:
            raise ValueError(f"Feature flag key collides with a reserved key: {spec.key!r}")
        if spec.key in seen:
            raise ValueError(f"Duplicate feature flag key: {spec.key!r}")
        if spec.audience not in ("client", "backend"):
            raise ValueError(f"Invalid feature flag audience: {spec.audience!r}")
        seen.add(spec.key)


_validate_registry()

_FLAGS_BY_KEY: dict[str, FeatureFlagSpec] = {spec.key: spec for spec in FEATURE_FLAGS}


@dataclass(frozen=True)
class MinimumSupportedVersions:
    """`X.Y.Z` 形式のバージョン文字列、または `None`（= 最低バージョンの指定なし）。

    比較（どのバージョンを弾くか）は行わない。その判断は mobile 側（SS-101）の責務。
    """

    ios: str | None
    android: str | None


class FeatureFlags:
    """登録簿（`FEATURE_FLAGS`）+ 取得済みドキュメント（`FlagDocumentSource`）から
    評価結果を返す。DB もトランザクションも持たない、ドメイン横断の薄い評価層。
    """

    def __init__(self, source: FlagDocumentSource) -> None:
        self._source = source

    def get_document(self) -> FlagDocument:
        """`FlagDocumentSource.get_document()` を1回だけ呼びたい呼び出し元
        （`/app-config` の router 等）向けの薄いラッパー。

        `client_flags()` / `minimum_supported_versions()` / `source_kind()` は
        それぞれ独立に呼ぶと `get_document()`（`AppConfigFlagSource` では
        `threading.Lock` を伴う）が1リクエストあたり3回走り、理論上ポーリング間隔の
        境界をまたぐと `flags` と `minimum_supported_versions` が異なる世代の
        ドキュメントに基づく極小の不整合が起こり得る。呼び出し元がここで1回だけ
        取得し、各メソッドへ明示的に渡すことでロック取得回数と世代不整合の両方を防ぐ。
        """
        return self._source.get_document()

    def is_enabled(self, key: str, document: FlagDocument | None = None) -> bool:
        """将来 `*, context=...`（ダークローンチ用）を足せる形にしておく
        （ADR-008 追補 D2。既存呼び出しはキーワード引数を渡していないため無変更で済む）。
        """
        if key not in _FLAGS_BY_KEY:
            logger.warning("is_enabled() called with an unregistered flag key: %s", key)
            return False
        return self._flag_enabled(document if document is not None else self.get_document(), key)

    def client_flags(self, document: FlagDocument | None = None) -> dict[str, bool]:
        """登録簿にある client 公開フラグを必ず全部返す（AppConfig 側に無ければ False）。

        AppConfig 側にある未知キー（登録簿にも予約キーにも無いもの）は無視する。
        これにより応答のキー集合が「デプロイされている backend のバージョン」だけで決まる。
        """
        if document is None:
            document = self.get_document()
        known_keys = _FLAGS_BY_KEY.keys() | RESERVED_FLAG_KEYS
        unknown_keys = set(document.values) - known_keys
        if unknown_keys:
            logger.debug("Ignoring unknown AppConfig flag keys: %s", sorted(unknown_keys))
        return {
            spec.key: self._flag_enabled(document, spec.key)
            for spec in FEATURE_FLAGS
            if spec.audience == "client"
        }

    def minimum_supported_versions(
        self, document: FlagDocument | None = None
    ) -> MinimumSupportedVersions:
        """`client_requirements` の属性から最低サポートバージョンを取り出す。

        AWS AppConfig の仕様: `enabled: false` のフラグの属性は `GetLatestConfiguration` の
        応答に含まれない。そのため OFF・属性欠落・形式不正のいずれも `None`
        （= 強制アップデートしない、安全側）に倒す。
        """
        if document is None:
            document = self.get_document()
        raw = document.values.get("client_requirements")
        if not isinstance(raw, dict) or raw.get("enabled") is not True:
            return MinimumSupportedVersions(ios=None, android=None)
        return MinimumSupportedVersions(
            ios=self._parse_version(raw.get("ios_minimum_version")),
            android=self._parse_version(raw.get("android_minimum_version")),
        )

    def source_kind(
        self, document: FlagDocument | None = None
    ) -> Literal["appconfig", "default", "stub"]:
        """診断用。`/app-config` の `config_source` にそのまま載る。"""
        if document is None:
            document = self.get_document()
        return document.kind

    @staticmethod
    def _flag_enabled(document: FlagDocument, key: str) -> bool:
        raw = document.values.get(key)
        if raw is None:
            return False
        if not isinstance(raw, dict):
            logger.warning("Feature flag value is not an object; treating as OFF: %s", key)
            return False
        enabled = raw.get("enabled", False)
        if not isinstance(enabled, bool):
            logger.warning("Feature flag 'enabled' is not a bool; treating as OFF: %s", key)
            return False
        return enabled

    @staticmethod
    def _parse_version(value: object) -> str | None:
        if not isinstance(value, str) or not _VERSION_PATTERN.match(value):
            if value is not None:
                logger.warning("client_requirements has an invalid version string.")
            return None
        return value

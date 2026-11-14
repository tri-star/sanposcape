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

from sanposcape.integrations.aws.appconfig import (
    FlagDocument,
    FlagDocumentSource,
    FlagSourceKind,
)

# `app_config/schemas.py` の `AppConfigRead.config_source` はここから再 import する
# （`domain → core` という既存の依存の向きを保つため。`FlagSourceKind` 自体の定義元は
# integrations/aws/appconfig.py の `FlagDocument.kind` と一致させる必要があるため据え置き。
# local-review F-14: 同じ Literal がここ・schemas.py・appconfig.py の3箇所に独立に
# 書かれていたのを1箇所に寄せた）。
__all__ = [
    "FEATURE_FLAGS",
    "FIXED_CLIENT_FLAGS",
    "FLAG_KEY_PATTERN",
    "RESERVED_FLAG_KEYS",
    "FeatureFlagSpec",
    "FeatureFlags",
    "FlagAudience",
    "FlagSourceKind",
    "MinimumSupportedVersions",
]

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


# キーを足す / 消すときは packages/backend/feature-flags.json（切り替えワークフローが使う
# 定義ファイル）も合わせて変更する。キー集合の一致は core/tests/test_feature_flags_document.py
# で検査している（SS-99, ADR-008 追補 D19）。
# 本番で現在 ON の `audience="client"` のフラグを消すときは、ここから消して
# `FIXED_CLIENT_FLAGS` へ移す。配布済みの mobile は未知キーを OFF に倒すため、キーが
# 返らなくなると公開済みの機能が消える（ADR-008 SS-233 追補 D40）。
FEATURE_FLAGS: tuple[FeatureFlagSpec, ...] = ()

# 削除の段階1 で固定値 `true` に移した、mobile が見るフラグ（ADR-008 SS-233 追補 D40）。
# `/app-config` は AppConfig の取得の状態に関わらず `true` を返す（一度も取得できていない間の
# 全 OFF（決定9）より優先する）。定義ファイル（feature-flags.json）には置かないので、
# ワークフローからは切り替えられない。分岐を消したコードを埋め込んだ最初のストアのバイナリの
# version 以上に最低サポートバージョンを上げてから、ここから消す（段階2。docs/compat-tracker.md）。
# 消すまでは、どのフラグの切り替えでも `prune` を付けない（段階1 より前の backend へ戻したときに
# AppConfig の値が要るため）。
FIXED_CLIENT_FLAGS: frozenset[str] = frozenset(
    {
        # ピン登録（SS-88）。1.0.0・1.1.0 がピンタブ・ピン登録・地図一覧などを出し分けている。
        # SS-271 で固定。
        "pin_registration",
        # ピンの登録画面の最寄り駅のタグ（SS-225）。1.1.0 が出し分けている。SS-271 で固定。
        "pin_station_tag",
        # 地図への招待（SS-90）。1.1.0 が出し分けている。SS-271 で固定。
        "map_invitation",
        # 地図単位のピンの表示・非表示（SS-266）。1.1.0 が出し分けている。SS-271 で固定。
        "map_pin_visibility",
        # 表示名の変更（SS-268）。1.1.0 が出し分けている。SS-271 で固定。
        "display_name_edit",
    }
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
    for key in FIXED_CLIENT_FLAGS:
        if not FLAG_KEY_PATTERN.match(key):
            raise ValueError(f"Invalid fixed feature flag key: {key!r}")
        if key in RESERVED_FLAG_KEYS or key in seen:
            raise ValueError(f"Fixed feature flag key collides with another key: {key!r}")


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
        if key in FIXED_CLIENT_FLAGS:
            return True
        if key not in _FLAGS_BY_KEY:
            logger.warning("is_enabled() called with an unregistered flag key: %s", key)
            return False
        return self._flag_enabled(document if document is not None else self.get_document(), key)

    def client_flags(self, document: FlagDocument | None = None) -> dict[str, bool]:
        """登録簿にある client 公開フラグを必ず全部返す（AppConfig 側に無ければ False）。

        `FIXED_CLIENT_FLAGS` は AppConfig の値を見ずに常に True を返す（ADR-008 SS-233 追補 D40）。
        AppConfig 側にある未知キー（登録簿にも予約キーにも無いもの。固定値のキーの残った値を
        含む）は無視する。これにより応答のキー集合が「デプロイされている backend のバージョン」
        だけで決まる。
        """
        if document is None:
            document = self.get_document()
        known_keys = _FLAGS_BY_KEY.keys() | RESERVED_FLAG_KEYS
        unknown_keys = set(document.values) - known_keys
        if unknown_keys:
            logger.debug("Ignoring unknown AppConfig flag keys: %s", sorted(unknown_keys))
        flags = {
            spec.key: self._flag_enabled(document, spec.key)
            for spec in FEATURE_FLAGS
            if spec.audience == "client"
        }
        flags.update(dict.fromkeys(sorted(FIXED_CLIENT_FLAGS), True))
        return flags

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

    def source_kind(self, document: FlagDocument | None = None) -> FlagSourceKind:
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

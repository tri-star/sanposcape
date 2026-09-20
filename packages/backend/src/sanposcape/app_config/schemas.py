from typing import Literal

from pydantic import BaseModel


class MinimumSupportedVersionsRead(BaseModel):
    """`X.Y.Z` 形式のバージョン文字列、または `null`。

    `null` は「最低バージョンの指定なし = 強制アップデートしない」を意味する
    （AppConfig を読めない場合の安全側フォールバックも同じ値になる。ADR-008 追補 D1）。
    """

    ios: str | None = None
    android: str | None = None


class AppConfigRead(BaseModel):
    """`GET /app-config` のレスポンス。"""

    flags: dict[str, bool]
    minimum_supported_versions: MinimumSupportedVersionsRead
    # 診断用。値の出どころ。クライアントはこの値で分岐してはいけない（秘密情報は含まない）。
    config_source: Literal["appconfig", "default", "stub"]

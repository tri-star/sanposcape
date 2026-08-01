"""ドメインをまたいで使う地理座標の共有スキーマ。

`maps` ドメインで定義されていたが、`walks` ドメインも同じ形の座標を扱うため
`core/` へ昇格した（folder-structure.md の「他ドメインから使う必要が出たものは
`core/` へ昇格させる」方針）。クラス名は変更していないため、OpenAPI の
コンポーネント名 `GeoPoint` は不変（mobile の生成物に破壊的変更を出さない）。
"""

from pydantic import BaseModel, Field


class GeoPoint(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

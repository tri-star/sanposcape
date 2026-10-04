"""`sanpo_maps.icon` の CHECK 制約について、モデルとマイグレーションの値のずれを検出する。

マイグレーションは過去のリビジョンの意味を変えないよう CHECK の値を直書きしている。
アプリの enum（`SANPO_MAP_ICONS`）だけを変えて新しいリビジョンを足し忘れると、
本番の DB はテストと違う値域のままになる。その取りこぼしをここで落とす。
"""

import re
from pathlib import Path

from sanposcape.sanpo_maps.models import SANPO_MAP_ICONS, SanpoMap

_MIGRATION_PATH = (
    Path(__file__).parents[4] / "alembic" / "versions" / "6835d3b2449d_add_icon_to_sanpo_maps.py"
)


def _icons_in(check_sql: str) -> list[str]:
    match = re.search(r"icon IN \(([^)]*)\)", check_sql)
    assert match is not None, check_sql
    return re.findall(r"'([^']*)'", match.group(1))


def _model_check_sql() -> str:
    constraints = [c for c in SanpoMap.__table__.constraints if c.name == "ck_sanpo_maps_icon"]
    assert len(constraints) == 1
    return str(constraints[0].sqltext)  # type: ignore[attr-defined]


def test_model_check_lists_every_icon_as_a_quoted_literal() -> None:
    assert _icons_in(_model_check_sql()) == list(SANPO_MAP_ICONS)


def test_migration_check_matches_model_icons() -> None:
    """マイグレーションの CHECK の値（順序込み）が `SANPO_MAP_ICONS` と一致すること。"""
    source = _MIGRATION_PATH.read_text(encoding="utf-8")
    # `create_check_constraint` に渡す、隣接する文字列リテラルの連結（`"..." "..."` → 連結）。
    match = re.search(r'"(icon IN \(.*?\))"', source, flags=re.DOTALL)
    assert match is not None
    check_sql = re.sub(r'"\s*"', "", match.group(1))
    assert _icons_in(check_sql) == list(SANPO_MAP_ICONS)

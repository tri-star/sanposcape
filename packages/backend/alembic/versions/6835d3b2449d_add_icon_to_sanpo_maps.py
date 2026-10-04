"""add_icon_to_sanpo_maps

地図にアイコン（`icon`）を足す（SS-171, ADR-009 決定31）。既存行は server default により
`pin` になる（PG11+ ではテーブルの書き換えは起きない）。CHECK の値は意図して直書きしている
（アプリの enum を変えても過去のリビジョンの意味を変えないため）。値を足すときは新しい
リビジョンで `ck_sanpo_maps_icon` を drop して create し直す。

注意:
- downgrade は icon 列のデータを失う。ロールバックするときは、icon を参照しない旧コードを
  先にデプロイしてから downgrade を流す（新コードが残ったまま流すと UndefinedColumn で 500 になる）。
- CHECK の追加は ACCESS EXCLUSIVE ロック下で全件走査する。大きなテーブルで同様の操作をするときは
  `NOT VALID` で追加してから `VALIDATE CONSTRAINT` に分ける（sanpo_maps は小さいのでこのまま）。

Revision ID: 6835d3b2449d
Revises: ad3075b8c45e
Create Date: 2026-10-04 12:26:56.437095

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '6835d3b2449d'
down_revision: str | None = 'ad3075b8c45e'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'sanpo_maps',
        sa.Column('icon', sa.String(length=16), server_default='pin', nullable=False),
    )
    # autogenerate は既存テーブルへの CHECK 制約の追加を検出しないので手で足す。
    op.create_check_constraint(
        'ck_sanpo_maps_icon',
        'sanpo_maps',
        "icon IN ('pin', 'tree', 'flower', 'leaf', 'sun', 'rain', 'retreat', "
        "'landmark', 'coffee', 'food', 'bakery', 'shopping', 'cat')",
    )


def downgrade() -> None:
    op.drop_constraint('ck_sanpo_maps_icon', 'sanpo_maps', type_='check')
    op.drop_column('sanpo_maps', 'icon')

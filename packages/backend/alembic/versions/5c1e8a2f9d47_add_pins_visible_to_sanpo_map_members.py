"""add_pins_visible_to_sanpo_map_members

メンバーシップに「この地図のピンをピンタブ・ナビタブの地図に出すか」（`pins_visible`）を足す
（SS-266）。利用者 × 地図の設定なので、地図の属性（`sanpo_maps`）ではなくメンバーシップに持つ
（共有地図で1人の選択がほかのメンバーに効かないように）。既存行は server default により
true（表示）になる（PG11+ ではテーブルの書き換えは起きない）。

注意:
- デプロイは migrate → 列を読むコードの順にする。`sanpo_map_members` は地図・ピンのほぼすべての
  API が読むので、列を読むコードを先に動かすと migrate までの間それらが UndefinedColumn で 500 になる。
  このリビジョンは列を読むコードより先に、単独の PR でマージ・デプロイ・migrate する（release-runbook §2・§7.4）。
- downgrade は利用者の選択を失う（すべての地図が表示に戻る）。ロールバックするときは、列を参照しない
  旧コードを先にデプロイしてから downgrade を流す。

Revision ID: 5c1e8a2f9d47
Revises: dd97ef20772e
Create Date: 2026-11-06 00:20:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5c1e8a2f9d47'
down_revision: str | None = 'dd97ef20772e'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'sanpo_map_members',
        sa.Column('pins_visible', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    )


def downgrade() -> None:
    op.drop_column('sanpo_map_members', 'pins_visible')

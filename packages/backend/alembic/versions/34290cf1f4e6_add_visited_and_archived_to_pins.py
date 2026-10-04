"""add_visited_and_archived_to_pins

ピンに訪問状況（`visited`）とアーカイブ状態（`archived`）を足す（SS-173, ADR-009 決定32）。
どちらも `BOOLEAN NOT NULL DEFAULT false`。既存行は server default により false になる
（PG11+ ではテーブルの書き換えは起きない）。

既存データの埋め戻し:
- `archived` は全件 false。
- `visited` は `client_walk_id IS NOT NULL` のピンだけ true にする。散歩中に登録したピンは
  その場（または近く）で登録しているので訪問済みとみなす（mobile の登録時の初期値の規則と揃える）。
  ピンタブの長押しで登録したピンは、実際に訪れていても未訪問から始まる（編集画面で直せる）。
  全件 false にしたい場合は upgrade の UPDATE 文を消せばよい。

注意:
- downgrade は 2 列のデータ（埋め戻した値を含む）を失う。ロールバックするときは、新しい列を
  参照しない旧コードを先にデプロイしてから downgrade を流す（新コードが残ったまま流すと
  UndefinedColumn で 500 になる）。
- 埋め戻しの UPDATE は対象行をロックする。pins は小さいのでこのままでよい。

Revision ID: 34290cf1f4e6
Revises: 6835d3b2449d
Create Date: 2026-10-04 15:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '34290cf1f4e6'
down_revision: str | None = '6835d3b2449d'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'pins',
        sa.Column('visited', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    )
    op.add_column(
        'pins',
        sa.Column('archived', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    )
    # 散歩中に登録したピンは訪問済みとみなす（SS-173。mobile の登録時の初期値の規則と揃える）。
    op.execute("UPDATE pins SET visited = true WHERE client_walk_id IS NOT NULL")


def downgrade() -> None:
    op.drop_column('pins', 'archived')
    op.drop_column('pins', 'visited')

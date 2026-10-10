"""add_taken_at_to_pin_photos

写真の撮影日時 `taken_at` を足す（SS-163, ADR-009 決定34）。`pin_photo_uploads`（枠）と
`pin_photos` の両方に `timestamptz NULL`。枠の発行時に端末が申告した値を保存し、紐付け時に
`pin_photos` へ写す。

既存データ:
- 既存の行は NULL のまま（遡及しない。原本は端末で再エンコード済みで EXIF が無く、埋める材料が無い）。
- 既定値なしの NULL 可の列追加はカタログの更新だけで、テーブルを書き換えない。

注意:
- downgrade は撮影日時を失う。ロールバックするときは、新しい列を参照しない旧コードを先に
  デプロイしてから downgrade を流す（新コードが残ったまま流すと UndefinedColumn で 500 になる）。

Revision ID: 06492408b21e
Revises: 34290cf1f4e6
Create Date: 2026-10-10 10:00:00.000000

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '06492408b21e'
down_revision: str | None = '34290cf1f4e6'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        'pin_photo_uploads', sa.Column('taken_at', sa.DateTime(timezone=True), nullable=True)
    )
    op.add_column('pin_photos', sa.Column('taken_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('pin_photos', 'taken_at')
    op.drop_column('pin_photo_uploads', 'taken_at')

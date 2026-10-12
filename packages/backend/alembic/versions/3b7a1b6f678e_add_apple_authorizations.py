"""add_apple_authorizations

Sign in with Apple の refresh token を保存するテーブルを新設する（SS-198）。
アカウント削除時に Apple の `/auth/revoke` で失効させるために使う。

新テーブルにした理由: `users` に列を足すと、deploy から migrate までの間に `users` を読む
全 API が 500 になる。新テーブルなら影響は、このテーブルを読む経路（Apple ユーザーの削除・
code 付きの Apple サインイン）だけに閉じる。

注意:
- downgrade は保存済みの refresh token を失う（失効できなくなる）。ロールバックするときは、
  このテーブルを参照しない旧コードを先にデプロイしてから downgrade を流す。

Revision ID: 3b7a1b6f678e
Revises: 06492408b21e
Create Date: 2026-10-12 00:02:14.732284

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3b7a1b6f678e'
down_revision: str | None = '06492408b21e'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table('apple_authorizations',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('client_id', sa.String(length=255), nullable=False),
    sa.Column('refresh_token', sa.Text(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id')
    )


def downgrade() -> None:
    op.drop_table('apple_authorizations')

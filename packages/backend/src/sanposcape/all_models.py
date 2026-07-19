"""全ドメインの SQLAlchemy モデルを 1 箇所で import して

`Base.metadata` に登録するための集約モジュール。
Alembic の autogenerate がスキーマ全体を認識できるようにする。
新しいドメインのモデルを追加したら、ここに import を足すこと。
"""

from sanposcape.database import Base
from sanposcape.spots.models import Spot  # noqa: F401

__all__ = ["Base"]

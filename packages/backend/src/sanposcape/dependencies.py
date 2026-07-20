"""横断的な FastAPI 依存をまとめるモジュール。

現時点では DB セッション供給のみ。認証済みユーザー取得などは
`core/security` の整備（M3）に合わせてここへ追加する。
"""

from sanposcape.database import get_db

__all__ = ["get_db"]

"""service層の戻り値をレスポンススキーマへ変換するマッパー。

`router.py` と `dev_router.py` の両方から使うため、どちらかのモジュール内に
private関数として置くとアンダースコア始まり（モジュール内専用の意思表示）を
別モジュールから import することになり、担当者が「privateだから自由に変えて
いい」と判断すると静かに壊れる（B-3）。public な関数としてここに切り出す。
"""

from sanposcape.auth.schemas import AuthUserRead, SessionRead
from sanposcape.auth.service import SessionResult


def to_session_read(result: SessionResult) -> SessionRead:
    return SessionRead(
        access_token=result.access_token,
        expires_in=result.expires_in,
        refresh_token=result.refresh_token,
        user=AuthUserRead.model_validate(result.user),
    )

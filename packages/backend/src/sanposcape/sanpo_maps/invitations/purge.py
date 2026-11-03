"""使い終わった招待の行を消す（SS-250, ADR-009 決定39）。

参加・取り消し・期限切れから 30 日を過ぎた `sanpo_map_invitations` の行を消す
（プライバシーポリシー 6）。
日次の Lambda（`aws_lambda/photo_purge.py`。アカウント削除後の写真の削除と同じ実行）から呼ぶ。
"""

from sqlalchemy.orm import Session

from sanposcape.sanpo_maps.invitations.repository import SanpoMapInvitationRepository
from sanposcape.sanpo_maps.invitations.service import SanpoMapInvitationService
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository


def purge_stale_invitations(db: Session, *, url_base: str) -> int:
    """消した行数を返す。`url_base` は使わないが、サービスの構築に要るので設定値を渡す。"""
    service = SanpoMapInvitationService(
        db, SanpoMapInvitationRepository(db), SanpoMapRepository(db), url_base=url_base
    )
    return service.purge_stale()

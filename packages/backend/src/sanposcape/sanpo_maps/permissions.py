"""地図の role による権限判定（純粋関数、DB/HTTP に依存しない）。

MVP で使うのは `can_add_pin` / `can_add_pin_photo` の2つのみ（owner/editor とも True）。
将来の編集・削除・タグ付与の権限マトリクスは ADR-009 に表として記録し、コードは
編集・招待チケット（BK-5/BK-7）で足す（backend-plan.md 5.9）。
"""

from sanposcape.sanpo_maps.schemas import SanpoMapRole

_WRITE_ROLES: tuple[SanpoMapRole, ...] = ("owner", "editor")


def can_add_pin(role: SanpoMapRole) -> bool:
    return role in _WRITE_ROLES


def can_add_pin_photo(role: SanpoMapRole) -> bool:
    """招待ユーザーが owner のピンに写真を足す要件をそのまま満たす（owner/editor とも True）。"""
    return role in _WRITE_ROLES

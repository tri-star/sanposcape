class SanpoMapNotFoundError(Exception):
    """指定された sanpo_map_id が存在しない、または現在のユーザーが member でない。

    他人の地図と存在しない ID を区別しない（403 ではなく常に 404 にする、
    ADR-003 決定6・walks/exceptions.py の WalkNotFoundError と同じ設計）。
    """


class SanpoMapPermissionDeniedError(Exception):
    """member だが書き込み権限の無い role（MVP では発生しない予約）。"""

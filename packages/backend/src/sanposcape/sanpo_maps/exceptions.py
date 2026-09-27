class SanpoMapNotFoundError(Exception):
    """指定された sanpo_map_id が存在しない、または現在のユーザーが member でない。

    他人の地図と存在しない ID を区別しない（403 ではなく常に 404 にする、
    ADR-003 決定6・walks/exceptions.py の WalkNotFoundError と同じ設計）。
    """


class SanpoMapPermissionDeniedError(Exception):
    """member だが role が操作を許さない（ピンの更新・削除・タグ・写真の一部, ADR-009
    決定19。地図そのものの更新・削除の editor, 決定26）。403。
    """

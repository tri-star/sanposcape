"""地図の role による権限判定（純粋関数、DB/HTTP に依存しない）。

権限マトリクスの確定版は ADR-009 決定19（BK-5, SS-112）を参照。「対象の作成者本人」は
操作ごとに対象が違う（ピンなら `pins.created_by_user_id`、タグなら
`pin_tags.created_by_user_id`、写真なら `pin_photos.uploaded_by_user_id`）ため、各関数は
`is_creator`/`is_uploader` をキーワード専用引数で受け取る（取り違え防止）。

未知の role（`_WRITE_ROLES` に無い値）は常に False にする（fail-safe）。owner 以外は
`role in _WRITE_ROLES` を満たさない限り何もできないため、`SanpoMapRole` の想定外の値が
渡っても構造的に安全側へ倒れる。
"""

from sanposcape.sanpo_maps.schemas import SanpoMapRole

_WRITE_ROLES: tuple[SanpoMapRole, ...] = ("owner", "editor")


def can_add_pin(role: SanpoMapRole) -> bool:
    return role in _WRITE_ROLES


def can_add_pin_photo(role: SanpoMapRole) -> bool:
    """招待ユーザーが owner のピンに写真を足す要件をそのまま満たす（owner/editor とも True）。"""
    return role in _WRITE_ROLES


def can_update_pin(role: SanpoMapRole, *, is_creator: bool) -> bool:
    """ピン本体（`name`/`memo`）の更新（ADR-009 決定19）。owner は他人のピンも可、
    editor は自分が作成したピンのみ可。
    """
    return role == "owner" or (role in _WRITE_ROLES and is_creator)


def can_delete_pin(role: SanpoMapRole, *, is_creator: bool) -> bool:
    """ピンの削除（ADR-009 決定19）。`can_update_pin` と同じ判定。editor が自分のピンを
    削除すると、他人が付けた写真・タグも DB の CASCADE で消える（決定19に明記）。
    """
    return role == "owner" or (role in _WRITE_ROLES and is_creator)


def can_add_pin_tag(role: SanpoMapRole) -> bool:
    """タグの追加（ADR-009 決定19）。`can_add_pin_photo` と同じく owner/editor とも True。"""
    return role in _WRITE_ROLES


def can_delete_pin_tag(role: SanpoMapRole, *, is_creator: bool) -> bool:
    """タグの削除（ADR-009 決定19）。ここでの「作成者」は**タグの作成者**
    （`pin_tags.created_by_user_id`）であり、ピンの作成者ではない。owner は他人が
    付けたタグも削除できる。
    """
    return role == "owner" or (role in _WRITE_ROLES and is_creator)


def can_delete_pin_photo(role: SanpoMapRole, *, is_uploader: bool) -> bool:
    """写真の削除（ADR-009 決定19）。持ち主は**アップロード者**（`pin_photos.
    uploaded_by_user_id`）であり、ピンの作成者ではない（容量計上がアップロード者基準の
    ため, 決定7 と一貫させる）。ピン作成者の editor でも、他人がアップロードした写真は
    削除できない。
    """
    return role == "owner" or (role in _WRITE_ROLES and is_uploader)

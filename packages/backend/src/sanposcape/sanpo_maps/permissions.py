"""地図の role による権限判定（純粋関数、DB/HTTP に依存しない）。

権限マトリクスの確定版は ADR-009 決定19（BK-5, SS-112）・決定26（地図そのものの操作,
SS-113）を参照。関数の形は3種類ある。

- **追加系**（`can_add_pin`/`can_add_pin_photo`/`can_add_pin_tag`/
  `can_update_pin_visited`）: role だけで判定する（`role in _WRITE_ROLES`）。作成者は
  判定しないので `is_creator` 引数は持たない。
- **対象の持ち主を判定する更新・削除系**（`can_update_pin`/`can_update_pin_archived`/
  `can_delete_pin`/`can_delete_pin_tag`/`can_delete_pin_photo`）は、操作ごとに対象が違う（ピンなら
  `pins.created_by_user_id`、タグなら `pin_tags.created_by_user_id`、写真なら
  `pin_photos.uploaded_by_user_id`）ため、`is_creator`/`is_uploader` をキーワード専用引数で
  受け取る（取り違え防止）。
- **地図そのものの管理系**（`can_update_sanpo_map`/`can_delete_sanpo_map`）: owner のみ
  （`role == "owner"`）。地図の名前・アイコン・存続は共有メンバー全員に影響するため、対象の持ち主を
  判定する引数（`is_creator` 相当）は持たない（決定26）。

ピンの訪問状況（`can_update_pin_visited`: 追加系の形）とアーカイブ状態
（`can_update_pin_archived`: 持ち主判定系の形）の変更は ADR-009 決定32（SS-173）。

未知の role（`_WRITE_ROLES` に無い値）は常に False にする（fail-safe）。owner 以外は
`role in _WRITE_ROLES` を満たさない限り何もできないため、`SanpoMapRole` の想定外の値が
渡っても構造的に安全側へ倒れる。
"""

from typing import Literal

#: `sanpo_map_members.role` と同じ値域（`models.py` の `SANPO_MAP_ROLES`）。
#: MVP では `owner` のみが出現する（editor は招待機能で登場する予約）。
SanpoMapRole = Literal["owner", "editor"]

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


def can_update_pin_visited(role: SanpoMapRole) -> bool:
    """ピンの訪問状況（`visited`）の変更（ADR-009 決定32, SS-173）。訪問は「行った人が付ける」
    事実で取り消しも容易なため、タグ・写真の追加と同じくメンバーなら誰でも可（追加系の形）。
    """
    return role in _WRITE_ROLES


def can_update_pin_archived(role: SanpoMapRole, *, is_creator: bool) -> bool:
    """ピンのアーカイブ状態（`archived`）の変更（ADR-009 決定32, SS-173）。アーカイブは全員の
    地図表示から消えるので削除に近く、owner かピン作成者のみ可（`can_update_pin` と同じ式だが、
    表の1行に1関数を対応させ、将来どちらかだけ変えられるよう別関数にしている）。
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


def can_update_sanpo_map(role: SanpoMapRole) -> bool:
    """地図の名前・アイコンの変更（`PATCH /sanpo-maps/{id}`, ADR-009 決定26・31）。owner のみ可。"""
    return role == "owner"


def can_delete_sanpo_map(role: SanpoMapRole) -> bool:
    """地図の削除（`DELETE /sanpo-maps/{id}`, ADR-009 決定26）。owner のみ可。"""
    return role == "owner"

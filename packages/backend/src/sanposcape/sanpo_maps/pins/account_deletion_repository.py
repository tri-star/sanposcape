"""アカウント削除のときの共有地図のデータ（SS-251 / ADR-009 決定40）の DB アクセス。

`pins`・`pin_tags` の作成者の列を書くので、そのテーブルを持つ `pins` に置く（ADR-011 M6）。
ピンの保存（`repository.py`）とは変わる理由が違う（退会のときのデータの方針）ので別のファイルにした。
"""

import uuid

from sqlalchemy import case, exists, func, select, update
from sqlalchemy.orm import Session, aliased

from sanposcape.sanpo_maps.models import Pin, PinPhoto, PinTag, SanpoMap


class AccountDeletionRepository:
    def __init__(self, db: Session) -> None:
        self._db = db

    def hand_over_to_map_owners(self, user_id: uuid.UUID) -> tuple[int, int]:
        """本人が owner でない地図にある、本人が作ったピン・タグの作成者を、その地図の
        owner に付け替える。付け替えたピンとタグの件数を返す。

        今メンバーかどうかは見ない（抜けた・外された後も本人のピンは地図に残るため。
        決定38）。`updated_at` は動かさない。Core の一括 UPDATE なので、同じセッションに
        読み込み済みの `Pin`・`PinTag` は更新されない（アカウント削除では読み込まない）。

        owner が同じ `client_pin_id` のピンを既に持っていると、付け替えで一意制約
        `(created_by_user_id, client_pin_id)` に当たり、アカウントを消せなくなる（`client_pin_id` は
        `GET /pins/{id}` で地図のメンバーに見えるので、owner がわざと同じ値でピンを作れる）。
        その行だけ `client_pin_id` を振り直す。作成者は消えるので、冪等な再送はもう来ない。
        """
        owner_pin = aliased(Pin)
        collides = (
            exists()
            .where(
                owner_pin.created_by_user_id == SanpoMap.owner_user_id,
                owner_pin.client_pin_id == Pin.client_pin_id,
            )
            .correlate(Pin, SanpoMap)
        )
        pins_stmt = (
            update(Pin)
            .where(
                Pin.sanpo_map_id == SanpoMap.id,
                Pin.created_by_user_id == user_id,
                SanpoMap.owner_user_id != user_id,
            )
            .values(
                created_by_user_id=SanpoMap.owner_user_id,
                client_pin_id=case((collides, func.gen_random_uuid()), else_=Pin.client_pin_id),
            )
        )
        tags_stmt = (
            update(PinTag)
            .where(
                PinTag.pin_id == Pin.id,
                Pin.sanpo_map_id == SanpoMap.id,
                PinTag.created_by_user_id == user_id,
                SanpoMap.owner_user_id != user_id,
            )
            .values(created_by_user_id=SanpoMap.owner_user_id)
        )
        # 複数テーブルの条件（UPDATE ... FROM）は ORM の同期（evaluate）に向かないので切る。
        options = {"synchronize_session": False}
        tags = self._db.execute(tags_stmt, execution_options=options).rowcount
        pins = self._db.execute(pins_stmt, execution_options=options).rowcount
        return pins, tags

    def lock_pins_for_owned_maps(self, owner_user_id: uuid.UUID) -> None:
        """本人が owner の地図の行と、そこに属するピン行を `FOR UPDATE` でロックする（決定33 の
        地図削除と同じ理由。写真キーの収集の前に呼ぶ）。書き込みではないので M6 の範囲内。

        順序は「ピン行 → 地図の行 → もう一度ピン行」。
        - 地図の行を取るのは、本人の地図へ移ってくる途中のピンのため。ピンの移動は移動先の地図の
          行を `FOR KEY SHARE` で取るので、移動の commit を待ってから2回目のピン行のロックと
          キーの収集の対象に入る（取らないと、移ってきたピンの写真のキーを集め損ね、CASCADE で
          行だけが消えて S3 の実体が残る）。
        - ピン行を地図の行より先に取るのは、写真の追加（ピン行 `FOR UPDATE` → S3 → 地図の行の
          `UPDATE`。`PinService.add_photos`）と向きを揃え、デッドロックを避けるため。
        """
        pins_in_owned_maps = (
            select(Pin.id)
            .join(SanpoMap, SanpoMap.id == Pin.sanpo_map_id)
            .where(SanpoMap.owner_user_id == owner_user_id)
            .with_for_update(of=Pin)
        )
        self._db.execute(pins_in_owned_maps).all()
        self._db.execute(
            select(SanpoMap.id).where(SanpoMap.owner_user_id == owner_user_id).with_for_update()
        ).all()
        self._db.execute(pins_in_owned_maps).all()

    def list_others_photo_keys_in_owned_maps(
        self, owner_user_id: uuid.UUID
    ) -> list[tuple[str, str | None]]:
        """本人が owner の地図にある、本人以外が上げた写真の `(s3_key, thumbnail_s3_key)`。

        本人の写真は含めない（アカウント削除後の保持期間の後に prefix ごと消す。決定36）。
        """
        stmt = (
            select(PinPhoto.s3_key, PinPhoto.thumbnail_s3_key)
            .join(Pin, Pin.id == PinPhoto.pin_id)
            .join(SanpoMap, SanpoMap.id == Pin.sanpo_map_id)
            .where(
                SanpoMap.owner_user_id == owner_user_id,
                PinPhoto.uploaded_by_user_id != owner_user_id,
            )
        )
        return [(row[0], row[1]) for row in self._db.execute(stmt).all()]

import uuid
import zlib
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import Select, exists, func, or_, select, tuple_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from sanposcape.pins.models import Pin, PinPhoto, PinPhotoUpload, PinTag
from sanposcape.pins.photo_attacher import PreparedPhoto
from sanposcape.pins.tag_labels import tag_key
from sanposcape.sanpo_maps.models import SanpoMap, SanpoMapMember


@dataclass(frozen=True)
class PinBoundingBox:
    """bbox 絞り込み(4つのクエリパラメータ)を repository に渡しやすい形にまとめたもの。

    他ドメインで使う予定が無いため `pins/` 内に置く(folder-structure.md「必要になったら
    core に昇格する」方針)。境界上の点は含む(`between()`, ADR-009 決定14)。
    """

    min_latitude: float
    min_longitude: float
    max_latitude: float
    max_longitude: float


def _escape_like(value: str) -> str:
    """ILIKE のパターン文字(`\\`・`%`・`_`)をリテラルとしてエスケープする。"""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


#: `pg_advisory_xact_lock(key1 int, key2 int)` の namespace（key1）。他用途のロックと
#: 衝突しない固定値にする（backend-plan.md 10章の注意）。
_PIN_PHOTO_UPLOAD_LOCK_NAMESPACE = zlib.crc32(b"sanposcape.pins.pin_photo_uploads") & 0x7FFFFFFF


def _advisory_lock_key(user_id: uuid.UUID) -> int:
    """UUID を `pg_advisory_xact_lock` の signed int4 キーへ畳み込む（決定的・プロセス非依存）。

    Python 組み込みの `hash()` は `PYTHONHASHSEED` によりプロセスごとに変わりうるため
    使わない（同一ユーザーの同時リクエストが別の Lambda 実行環境で処理された場合に
    ロックが効かなくなる）。128bit を32bit ずつ XOR で畳み込むだけなので衝突はあり得るが、
    無関係なユーザー同士がまれに同じロックを共有するだけで、ロックの正しさ
    （同一ユーザーの同時リクエストを直列化する）は損なわれない。
    """
    raw = user_id.int
    key = 0
    for shift in range(0, 128, 32):
        key ^= (raw >> shift) & 0xFFFFFFFF
    if key >= 2**31:
        key -= 2**32
    return key


#: `PinRepository.update_fields()` の「送られなかった」ことを表す番兵。`None` は
#: 「値を消す」という意味のある入力（`PinUpdate` と同じ規約）のため区別が要る。
NOT_PROVIDED: Any = object()


@dataclass(frozen=True)
class PinReadModel:
    """`PinRead` を組み立てるのに必要な情報一式（1回のロードで揃える）。"""

    pin: Pin
    sanpo_map: SanpoMap
    tags: list[PinTag]
    photos: list[PinPhoto]
    photo_count: int


class PinRepository:
    """pins / pin_photos / pin_tags への DB アクセスを隔離する層。

    member 判定が絡む取得メソッドは `user_id` を必須引数に取り、`sanpo_map_members` との
    JOIN で絞る（ID だけで引ける口を作らない。ADR-003 決定6 と同じ構造的な IDOR 対策）。
    """

    def __init__(self, db: Session) -> None:
        self._db = db

    def get_by_client_pin_id(self, *, user_id: uuid.UUID, client_pin_id: uuid.UUID) -> Pin | None:
        stmt = select(Pin).where(
            Pin.created_by_user_id == user_id, Pin.client_pin_id == client_pin_id
        )
        return self._db.scalars(stmt).first()

    def create(
        self,
        *,
        sanpo_map_id: uuid.UUID,
        created_by_user_id: uuid.UUID,
        client_pin_id: uuid.UUID,
        name: str | None,
        memo: str | None,
        latitude: float,
        longitude: float,
        client_walk_id: uuid.UUID | None,
    ) -> tuple[Pin, bool]:
        """ピンを新規作成する。戻り値は `(pin, created)`。

        `walks/repository.py::create()` と同じ savepoint パターン: `(created_by_user_id,
        client_pin_id)` の UNIQUE 制約違反を `db.begin_nested()` で捕捉し、既存行を
        再取得して返す（`created=False`）。
        """
        pin = Pin(
            sanpo_map_id=sanpo_map_id,
            created_by_user_id=created_by_user_id,
            client_pin_id=client_pin_id,
            name=name,
            memo=memo,
            latitude=latitude,
            longitude=longitude,
            client_walk_id=client_walk_id,
        )
        try:
            with self._db.begin_nested():
                self._db.add(pin)
                self._db.flush()
        except IntegrityError:
            existing = self.get_by_client_pin_id(
                user_id=created_by_user_id, client_pin_id=client_pin_id
            )
            if existing is None:
                raise
            return existing, False
        self._db.refresh(pin)
        return pin, True

    @staticmethod
    def _member_pin_stmt(*, user_id: uuid.UUID, pin_id: uuid.UUID) -> Select:
        return (
            select(Pin, SanpoMapMember.role)
            .join(SanpoMap, SanpoMap.id == Pin.sanpo_map_id)
            .join(SanpoMapMember, SanpoMapMember.sanpo_map_id == SanpoMap.id)
            .where(SanpoMapMember.user_id == user_id, Pin.id == pin_id)
        )

    def get_for_member_for_update(
        self, *, user_id: uuid.UUID, pin_id: uuid.UUID
    ) -> tuple[Pin, str] | None:
        """member 判定込みでピンを取得し、`pins` 行を `FOR UPDATE` でロックする。

        写真追加時の position 割り当ての同時実行競合を防ぐ（backend-plan.md 5.3 (5)）。
        """
        stmt = self._member_pin_stmt(user_id=user_id, pin_id=pin_id).with_for_update(of=Pin)
        row = self._db.execute(stmt).first()
        return None if row is None else (row[0], row[1])

    def get_for_member(self, *, user_id: uuid.UUID, pin_id: uuid.UUID) -> tuple[Pin, str] | None:
        """member 判定込みでピンを取得する（ロックなし。閲覧 API・SS-112 の権限判定用）。

        `get_for_member_for_update()` と同じ JOIN で、`with_for_update` を付けない。
        """
        row = self._db.execute(self._member_pin_stmt(user_id=user_id, pin_id=pin_id)).first()
        return None if row is None else (row[0], row[1])

    def list_for_member(
        self,
        *,
        user_id: uuid.UUID,
        sanpo_map_id: uuid.UUID,
        bbox: PinBoundingBox | None,
        q: str | None,
        tag_keys: list[str],
        limit: int,
        cursor: tuple[datetime, uuid.UUID] | None,
    ) -> list[Pin]:
        """`created_at DESC, id DESC` で並べたピンを最大 `limit + 1` 件返す（SS-111）。

        `sanpo_map_members` との JOIN で member 判定を行う（呼び出し元の service が
        `get_role()` で先に検証していても、多重防御として repository 側でも絞る）。
        `limit + 1` 件目の有無で `next_cursor` の要否を判断するのは `WalkRepository.
        list_for_user()` と同じ形。
        """
        stmt = (
            select(Pin)
            .join(SanpoMapMember, SanpoMapMember.sanpo_map_id == Pin.sanpo_map_id)
            .where(SanpoMapMember.user_id == user_id, Pin.sanpo_map_id == sanpo_map_id)
        )
        if bbox is not None:
            stmt = stmt.where(
                Pin.latitude.between(bbox.min_latitude, bbox.max_latitude),
                Pin.longitude.between(bbox.min_longitude, bbox.max_longitude),
            )
        if q is not None:
            pattern = f"%{_escape_like(q)}%"
            tag_matches = exists(
                select(1).where(PinTag.pin_id == Pin.id, PinTag.label.ilike(pattern, escape="\\"))
            )
            stmt = stmt.where(
                or_(
                    Pin.name.ilike(pattern, escape="\\"),
                    Pin.memo.ilike(pattern, escape="\\"),
                    tag_matches,
                )
            )
        for key in tag_keys:
            stmt = stmt.where(
                exists(select(1).where(PinTag.pin_id == Pin.id, PinTag.label_key == key))
            )
        stmt = stmt.order_by(Pin.created_at.desc(), Pin.id.desc()).limit(limit + 1)
        if cursor is not None:
            cursor_created_at, cursor_id = cursor
            # keyset 条件（行値比較）: (created_at, id) < (cursor_created_at, cursor_id)
            stmt = stmt.where(tuple_(Pin.created_at, Pin.id) < (cursor_created_at, cursor_id))
        return list(self._db.scalars(stmt).all())

    def list_tags_for_pins(self, pin_ids: list[uuid.UUID]) -> dict[uuid.UUID, list[PinTag]]:
        """複数ピンのタグをまとめて取得する（一覧の N+1 回避）。

        並び順は `list_tags()` と同じ `created_at, id`（同一トランザクション内 INSERT は
        `created_at` が同値になりうるため、入力順の保持は保証しない）。

        `pin_ids` は認可済み（`get_role()`/`get_for_member()` を通して member であることを
        確認済み）のものを渡すこと（`list_photos_page()` と同じ前提）。
        """
        if not pin_ids:
            return {}
        stmt = (
            select(PinTag)
            .where(PinTag.pin_id.in_(pin_ids))
            .order_by(PinTag.pin_id, PinTag.created_at, PinTag.id)
        )
        result: dict[uuid.UUID, list[PinTag]] = {}
        for tag in self._db.scalars(stmt).all():
            result.setdefault(tag.pin_id, []).append(tag)
        return result

    def get_cover_photos(self, pin_ids: list[uuid.UUID]) -> dict[uuid.UUID, PinPhoto]:
        """各ピンの代表写真（position が最小のもの）をまとめて取得する（ADR-009 決定15）。

        写真が無いピンは戻り値の dict に入らない（呼び出し側は `.get(id)` で `None` 扱いに
        する）。PostgreSQL の `DISTINCT ON`（`Select.distinct(*cols)`）を使う。

        `pin_ids` は認可済み（`get_role()`/`get_for_member()` を通して member であることを
        確認済み）のものを渡すこと（`list_photos_page()` と同じ前提）。
        """
        if not pin_ids:
            return {}
        stmt = (
            select(PinPhoto)
            .where(PinPhoto.pin_id.in_(pin_ids))
            .order_by(PinPhoto.pin_id, PinPhoto.position, PinPhoto.id)
            .distinct(PinPhoto.pin_id)
        )
        return {photo.pin_id: photo for photo in self._db.scalars(stmt).all()}

    def count_photos_for_pins(self, pin_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
        """各ピンの写真枚数をまとめて取得する。0件のピンは dict に入らない
        （呼び出し側は `.get(id, 0)` にする）。

        `pin_ids` は認可済み（`get_role()`/`get_for_member()` を通して member であることを
        確認済み）のものを渡すこと（`list_photos_page()` と同じ前提）。
        """
        if not pin_ids:
            return {}
        stmt = (
            select(PinPhoto.pin_id, func.count())
            .where(PinPhoto.pin_id.in_(pin_ids))
            .group_by(PinPhoto.pin_id)
        )
        return dict(self._db.execute(stmt).all())

    def list_photos_page(
        self, *, pin_id: uuid.UUID, limit: int, cursor: tuple[int, uuid.UUID] | None
    ) -> list[PinPhoto]:
        """`(position, id)` の keyset で写真を最大 `limit + 1` 件返す（`GET /pins/{id}/photos`,
        ADR-009 決定17）。

        `pin_id` の認可は呼び出し側（service）が `get_for_member()` を通してから呼ぶこと
        （既存の `list_photos()`/`count_photos()`/`load_read_model()` と同じ前提）。
        """
        stmt = (
            select(PinPhoto)
            .where(PinPhoto.pin_id == pin_id)
            .order_by(PinPhoto.position, PinPhoto.id)
            .limit(limit + 1)
        )
        if cursor is not None:
            cursor_position, cursor_id = cursor
            stmt = stmt.where(tuple_(PinPhoto.position, PinPhoto.id) > (cursor_position, cursor_id))
        return list(self._db.scalars(stmt).all())

    def next_photo_position(self, pin_id: uuid.UUID) -> int:
        stmt = select(func.coalesce(func.max(PinPhoto.position), -1) + 1).where(
            PinPhoto.pin_id == pin_id
        )
        return self._db.scalar(stmt) or 0

    def add_photos(
        self,
        *,
        pin_id: uuid.UUID,
        uploaded_by_user_id: uuid.UUID,
        prepared: list[PreparedPhoto],
        start_position: int,
    ) -> list[PinPhoto]:
        photos = [
            PinPhoto(
                pin_id=pin_id,
                uploaded_by_user_id=uploaded_by_user_id,
                upload_id=item.upload_id,
                s3_key=item.original_key,
                content_type=item.content_type,
                byte_size=item.byte_size,
                width=item.width,
                height=item.height,
                thumbnail_s3_key=item.thumbnail_key,
                thumbnail_byte_size=item.thumbnail_byte_size,
                thumbnail_width=item.thumbnail_width,
                thumbnail_height=item.thumbnail_height,
                position=start_position + offset,
            )
            for offset, item in enumerate(prepared)
        ]
        self._db.add_all(photos)
        # SQLAlchemy 2.0 + psycopg は複数行 INSERT でも `RETURNING`（insertmanyvalues）で
        # サーバー生成値（`created_at`）を `flush()` 時点で populate 済みにする。ループでの
        # `refresh()`（写真枚数ぶんの追加 SELECT）は不要で、確定処理という時間予算がタイトな
        # 経路で無駄な DB ラウンドトリップを増やすだけなので行わない。
        self._db.flush()
        return photos

    def add_tags(
        self, *, pin_id: uuid.UUID, created_by_user_id: uuid.UUID, labels: list[str]
    ) -> list[PinTag]:
        tags = [
            PinTag(
                pin_id=pin_id,
                label=label,
                label_key=tag_key(label),
                created_by_user_id=created_by_user_id,
            )
            for label in labels
        ]
        self._db.add_all(tags)
        # add_photos() と同じ理由でループでの refresh() は行わない（flush() の
        # RETURNING で created_at は既に populate 済み）。
        self._db.flush()
        return tags

    def list_tags(self, pin_id: uuid.UUID) -> list[PinTag]:
        """タグを `created_at, id` 順で返す。

        ★ 同一トランザクション内で複数タグを INSERT した場合（`add_tags()` の通常の
        呼び出され方）、PostgreSQL の `now()` はトランザクション開始時刻で固定されるため
        `created_at` が同値になり、実質的に `id`（ランダムな UUID）順にフォールバックする。
        つまり **`PinCreate.tags` の入力順を保持する保証はない**（順序保持が必要になったら
        `position` 列の追加を検討する）。
        """
        stmt = select(PinTag).where(PinTag.pin_id == pin_id).order_by(PinTag.created_at, PinTag.id)
        return list(self._db.scalars(stmt).all())

    def list_photos(self, pin_id: uuid.UUID, *, limit: int | None = None) -> list[PinPhoto]:
        stmt = select(PinPhoto).where(PinPhoto.pin_id == pin_id).order_by(PinPhoto.position)
        if limit is not None:
            stmt = stmt.limit(limit)
        return list(self._db.scalars(stmt).all())

    def count_photos(self, pin_id: uuid.UUID) -> int:
        stmt = select(func.count()).select_from(PinPhoto).where(PinPhoto.pin_id == pin_id)
        return self._db.scalar(stmt) or 0

    def load_read_model(self, pin_id: uuid.UUID, *, photos_limit: int) -> PinReadModel | None:
        pin = self._db.get(Pin, pin_id)
        if pin is None:
            return None
        sanpo_map = self._db.get(SanpoMap, pin.sanpo_map_id)
        if sanpo_map is None:
            # FK 制約により必ず存在するはずの不変条件違反。`assert` は `-O`/`PYTHONOPTIMIZE`
            # 実行時にバイトコードごと除去されるため使わない（auth/service.py の
            # `raise AssertionError("unreachable")` と同じ流儀）。
            raise AssertionError("Pin references a missing sanpo_map (FK integrity violated)")
        return PinReadModel(
            pin=pin,
            sanpo_map=sanpo_map,
            tags=self.list_tags(pin_id),
            photos=self.list_photos(pin_id, limit=photos_limit),
            photo_count=self.count_photos(pin_id),
        )

    def update_fields(
        self,
        pin: Pin,
        *,
        name: str | None = NOT_PROVIDED,
        memo: str | None = NOT_PROVIDED,
        updated_at: datetime,
    ) -> None:
        """`name`/`memo` のうち、実際に渡されたものだけを更新して flush する
        （`PATCH /pins/{pin_id}`, ADR-009 決定20）。

        呼び出し元（service）はこのメソッドを実際に変化がある場合だけ呼ぶこと。
        `updated_at` は呼ばれるたびに必ず注入した値へ更新する（決定23）。
        """
        if name is not NOT_PROVIDED:
            pin.name = name
        if memo is not NOT_PROVIDED:
            pin.memo = memo
        pin.updated_at = updated_at
        self._db.flush()

    def get_tags_by_ids(self, *, pin_id: uuid.UUID, tag_ids: list[uuid.UUID]) -> list[PinTag]:
        """このピンに属するタグのうち、指定した ID のものだけを返す（`pin_id` で絞るため、
        他のピンの ID を渡しても空になる。呼び出し元はこれで「このピンに無い ID」を
        黙って無視できる, ADR-009 決定21）。
        """
        if not tag_ids:
            return []
        stmt = select(PinTag).where(PinTag.pin_id == pin_id, PinTag.id.in_(tag_ids))
        return list(self._db.scalars(stmt).all())

    def delete_tags(self, tags: list[PinTag]) -> None:
        """ORM の `session.delete()` で1件ずつ消す（一括 DELETE 文は使わない。walks と
        同じ流儀）。
        """
        for tag in tags:
            self._db.delete(tag)
        self._db.flush()

    def count_tags(self, pin_id: uuid.UUID) -> int:
        stmt = select(func.count()).select_from(PinTag).where(PinTag.pin_id == pin_id)
        return self._db.scalar(stmt) or 0

    def get_photo_for_pin(self, *, pin_id: uuid.UUID, photo_id: uuid.UUID) -> PinPhoto | None:
        """`pin_id` と `photo_id` の両方で絞る（ID だけで引ける口を作らない。`photo_id` が
        他のピンに属する場合も `None` になり `Pin photo not found` として扱われる,
        ADR-009 決定21）。
        """
        stmt = select(PinPhoto).where(PinPhoto.pin_id == pin_id, PinPhoto.id == photo_id)
        return self._db.scalars(stmt).first()

    def list_photo_keys(self, pin_id: uuid.UUID) -> list[tuple[str, str | None]]:
        """`(s3_key, thumbnail_s3_key)` の列だけを取る（ピン削除時, ADR-009 決定22）。

        写真が数百枚あってもエンティティ全体は読み込まない。`thumbnail_s3_key` は
        NULL 許容なので `None` を含みうる（呼び出し側でフィルタする）。
        """
        stmt = select(PinPhoto.s3_key, PinPhoto.thumbnail_s3_key).where(PinPhoto.pin_id == pin_id)
        return [(row[0], row[1]) for row in self._db.execute(stmt).all()]

    def delete_photo(self, photo: PinPhoto) -> None:
        self._db.delete(photo)
        self._db.flush()

    def delete_pin(self, pin: Pin) -> None:
        """ピンを削除する。子の行（`pin_photos`/`pin_tags`）は DB の `ON DELETE CASCADE`
        で消える（`relationship()` を張っていないため ORM の cascade は効かない。
        commit 前に同じセッションで子エンティティを触らないこと, ADR-009 決定22）。
        """
        self._db.delete(pin)
        self._db.flush()


class PinPhotoUploadRepository:
    """pin_photo_uploads への DB アクセスを隔離する層。"""

    def __init__(self, db: Session) -> None:
        self._db = db

    def acquire_user_lock(self, *, user_id: uuid.UUID) -> None:
        """ユーザー単位の advisory lock を取る（容量チェックの競合防止, B-D5）。

        トランザクションスコープ（`pg_advisory_xact_lock`）なので、呼び出し元の
        commit/rollback で自動的に解放される。
        """
        self._db.execute(
            select(
                func.pg_advisory_xact_lock(
                    _PIN_PHOTO_UPLOAD_LOCK_NAMESPACE, _advisory_lock_key(user_id)
                )
            )
        )

    def count_active_pending(self, *, user_id: uuid.UUID, now: datetime) -> int:
        stmt = (
            select(func.count())
            .select_from(PinPhotoUpload)
            .where(
                PinPhotoUpload.user_id == user_id,
                PinPhotoUpload.status == "pending",
                PinPhotoUpload.expires_at > now,
            )
        )
        return self._db.scalar(stmt) or 0

    def sum_reserved_bytes(self, *, user_id: uuid.UUID, now: datetime) -> int:
        """未期限の `pending` 枠の申告サイズ合計（容量の先食い分）。"""
        stmt = select(func.coalesce(func.sum(PinPhotoUpload.declared_byte_size), 0)).where(
            PinPhotoUpload.user_id == user_id,
            PinPhotoUpload.status == "pending",
            PinPhotoUpload.expires_at > now,
        )
        return self._db.scalar(stmt) or 0

    def sum_attached_bytes(self, *, user_id: uuid.UUID) -> int:
        """確定済み（`pin_photos`）の実サイズ合計。原本のみ計上（サムネイルは数えない, B-D18）。"""
        stmt = select(func.coalesce(func.sum(PinPhoto.byte_size), 0)).where(
            PinPhoto.uploaded_by_user_id == user_id
        )
        return self._db.scalar(stmt) or 0

    def create(
        self,
        *,
        upload_id: uuid.UUID,
        user_id: uuid.UUID,
        s3_key: str,
        content_type: str,
        declared_byte_size: int,
        expires_at: datetime,
    ) -> PinPhotoUpload:
        upload = PinPhotoUpload(
            id=upload_id,
            user_id=user_id,
            s3_key=s3_key,
            content_type=content_type,
            declared_byte_size=declared_byte_size,
            expires_at=expires_at,
        )
        self._db.add(upload)
        self._db.flush()
        self._db.refresh(upload)
        return upload

    def lock_for_attach(
        self, *, user_id: uuid.UUID, upload_ids: list[uuid.UUID]
    ) -> list[PinPhotoUpload]:
        """他人の `upload_id` は「見つからない」扱い（`user_id` 必須, IDOR 対策）。"""
        stmt = (
            select(PinPhotoUpload)
            .where(PinPhotoUpload.user_id == user_id, PinPhotoUpload.id.in_(upload_ids))
            .with_for_update()
        )
        return list(self._db.scalars(stmt).all())

    def mark_attached(self, *, upload_ids: list[uuid.UUID], attached_at: datetime) -> None:
        self._db.execute(
            update(PinPhotoUpload)
            .where(PinPhotoUpload.id.in_(upload_ids))
            .values(status="attached", attached_at=attached_at)
        )

    def find_own_for_update(
        self, *, user_id: uuid.UUID, upload_id: uuid.UUID
    ) -> PinPhotoUpload | None:
        """本人の枠を1件、行ロック付きで取得する（`DELETE /pin-photo-uploads/{upload_id}`,
        PR #93 T11）。他人の `upload_id` は「見つからない」扱い（IDOR 対策、
        `lock_for_attach()` と同じ設計）。

        `with_for_update()` にする理由: 同時に別リクエストがこの枠を `lock_for_attach()`
        で確定処理中（＝行ロック保持中）の場合、ここでの取得をその確定処理の commit/
        rollback まで待たせる。ロックせずに読むと「pending」の古い状態を読んだまま
        削除してしまい、直後に相手が `attached` へ更新してコミットする、という
        取り消し不能な競合（本来 409 になるべき削除が成功してしまう）が起こりうる。
        """
        stmt = (
            select(PinPhotoUpload)
            .where(PinPhotoUpload.user_id == user_id, PinPhotoUpload.id == upload_id)
            .with_for_update()
        )
        return self._db.scalars(stmt).first()

    def delete(self, upload: PinPhotoUpload) -> None:
        """行を削除する（`status` に「取り消し済み」を追加せず物理削除する。PR #93 T11:
        容量予約（`sum_reserved_bytes`）・未使用枠カウント（`count_active_pending`）は
        どちらも `status="pending"` の行を数えるため、削除すれば即座に対象から外れる）。
        """
        self._db.delete(upload)
        self._db.flush()

    def find_attachments(
        self, *, user_id: uuid.UUID, upload_ids: list[uuid.UUID]
    ) -> dict[uuid.UUID, tuple[uuid.UUID, uuid.UUID]]:
        """指定した `upload_id` 群のうち、既にどこかの写真に紐づいているものを
        `{upload_id: (pin_id, client_pin_id)}` で返す。

        `uploaded_by_user_id == user_id` で絞る（アップロード者本人以外の枠の紐付け状況を
        横断的に解決できないようにする, IDOR 対策。他のリポジトリメソッドと同じ
        「`user_id` を必須引数にし ID だけで引ける口を作らない」規約に合わせる）。
        1クエリでまとめて解決するため、複数件を呼び出し元でループしても N+1 にならない。
        """
        if not upload_ids:
            return {}
        stmt = (
            select(PinPhoto.upload_id, PinPhoto.pin_id, Pin.client_pin_id)
            .join(Pin, Pin.id == PinPhoto.pin_id)
            .where(PinPhoto.upload_id.in_(upload_ids), PinPhoto.uploaded_by_user_id == user_id)
        )
        return {row[0]: (row[1], row[2]) for row in self._db.execute(stmt)}

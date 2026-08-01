import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from sanposcape.core.pagination import decode_cursor, encode_cursor
from sanposcape.users.models import User
from sanposcape.walks.exceptions import WalkNotFoundError
from sanposcape.walks.mappers import to_walk_detail_read, to_walk_read, track_to_storage
from sanposcape.walks.repository import WalkRepository
from sanposcape.walks.schemas import WalkCreate, WalkDetailRead, WalkListRead, WalkRead


class WalkService:
    """散歩(Walk)に関するユースケース。トランザクション境界（commit）はここが持つ。"""

    def __init__(self, db: Session, repository: WalkRepository) -> None:
        self._db = db
        self._repository = repository

    def record_walk(self, current_user: User, payload: WalkCreate) -> tuple[WalkRead, bool]:
        """散歩の記録を保存する。戻り値は `(walk, created)`。

        `created=False` は `client_walk_id` の再送（冪等な既存行の返却）を表す。
        """
        walk, created = self._repository.create(
            user_id=current_user.id,
            client_walk_id=payload.client_walk_id,
            started_at=payload.started_at,
            ended_at=payload.ended_at,
            duration_seconds=payload.duration_seconds,
            distance_meters=payload.distance_meters,
            destination_place_id=payload.destination.place_id,
            destination_name=payload.destination.name,
            destination_latitude=payload.destination.location.latitude,
            destination_longitude=payload.destination.location.longitude,
            track_points=track_to_storage(payload.track),
        )
        self._db.commit()
        return to_walk_read(walk), created

    def list_walks(
        self,
        current_user: User,
        *,
        limit: int,
        cursor: str | None,
        started_after: datetime | None,
        started_before: datetime | None,
    ) -> WalkListRead:
        decoded_cursor = decode_cursor(cursor) if cursor is not None else None

        rows = self._repository.list_for_user(
            user_id=current_user.id,
            limit=limit,
            cursor=decoded_cursor,
            started_after=started_after,
            started_before=started_before,
        )

        has_more = len(rows) > limit
        page = rows[:limit]
        next_cursor = encode_cursor(page[-1].started_at, page[-1].id) if has_more and page else None

        return WalkListRead(items=[to_walk_read(walk) for walk in page], next_cursor=next_cursor)

    def get_walk(self, current_user: User, walk_id: uuid.UUID) -> WalkDetailRead:
        walk = self._repository.get_by_id(user_id=current_user.id, walk_id=walk_id)
        if walk is None:
            raise WalkNotFoundError()
        return to_walk_detail_read(walk)

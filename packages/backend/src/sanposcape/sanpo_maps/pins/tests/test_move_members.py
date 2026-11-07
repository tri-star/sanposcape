"""ピンの移動を「移動先に移動元の全メンバーがいる」ときだけ許す（ADR-009 決定42, SS-192）。

`PATCH /pins/{pin_id}` の 403 `move_target_missing_members` と、移動先の候補
`GET /pins/{pin_id}/move-targets`、その下の repository の判定を固定する。役割（role）による
移動の権限は `test_router.py` の `TestPinMovePermissionMatrix`（決定33）。
"""

import uuid
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from sanposcape.auth.tokens import create_access_token
from sanposcape.config import Settings
from sanposcape.integrations.aws.s3 import FakeObjectStorage
from sanposcape.sanpo_maps.conftest import make_user
from sanposcape.sanpo_maps.maps.repository import SanpoMapRepository
from sanposcape.sanpo_maps.models import SanpoMapMember
from sanposcape.users.models import User


def _headers(user: User, settings: Settings) -> dict[str, str]:
    token, _ = create_access_token(user_id=user.id, settings=settings)
    return {"Authorization": f"Bearer {token}"}


def _create_map(db: Session, *, owner: User, name: str, is_default: bool = False) -> uuid.UUID:
    sanpo_map, _ = SanpoMapRepository(db).create_with_owner(
        owner_user_id=owner.id, name=name, is_default=is_default
    )
    db.commit()
    return sanpo_map.id


def _add_editors(db: Session, sanpo_map_id: uuid.UUID, *users: User) -> None:
    for user in users:
        db.add(SanpoMapMember(sanpo_map_id=sanpo_map_id, user_id=user.id, role="editor"))
    db.commit()


@dataclass
class _World:
    """家族（owner・partner）で共有する地図のピンと、移動先の候補の地図。

    - `family`: owner の既定地図。partner が editor。ピンはここにある（partner が作成）
    - `family_trip`: owner の地図。partner が editor（移動元と同じ顔ぶれ）
    - `with_friend`: owner の地図。partner と friend が editor（移動元より広い）
    - `owner_solo`: owner だけの地図（partner がいない）
    - `friend_map`: friend の地図。owner だけが editor（partner がいない・呼んだ人は editor）
    """

    client: TestClient
    settings: Settings
    owner: User
    partner: User
    friend: User
    outsider: User
    family: uuid.UUID
    family_trip: uuid.UUID
    with_friend: uuid.UUID
    owner_solo: uuid.UUID
    friend_map: uuid.UUID
    pin_id: str


@pytest.fixture
def world(
    fake_storage_client: tuple[TestClient, FakeObjectStorage],
    fake_storage_settings: Settings,
    db_session: Session,
) -> _World:
    client, _storage = fake_storage_client
    owner = make_user(db_session, subject="mm-owner")
    partner = make_user(db_session, subject="mm-partner")
    friend = make_user(db_session, subject="mm-friend")
    outsider = make_user(db_session, subject="mm-outsider")

    family = _create_map(db_session, owner=owner, name="家族", is_default=True)
    _add_editors(db_session, family, partner)
    family_trip = _create_map(db_session, owner=owner, name="家族旅行")
    _add_editors(db_session, family_trip, partner)
    with_friend = _create_map(db_session, owner=owner, name="友だちと")
    _add_editors(db_session, with_friend, partner, friend)
    owner_solo = _create_map(db_session, owner=owner, name="ひとり")
    friend_map = _create_map(db_session, owner=friend, name="友だちの地図", is_default=True)
    _add_editors(db_session, friend_map, owner)

    pin = client.post(
        "/pins",
        headers=_headers(partner, fake_storage_settings),
        json={
            "client_pin_id": str(uuid.uuid4()),
            "sanpo_map_id": str(family),
            "location": {"latitude": 35.0, "longitude": 139.0},
            "name": "公園",
        },
    )
    assert pin.status_code == 201
    return _World(
        client=client,
        settings=fake_storage_settings,
        owner=owner,
        partner=partner,
        friend=friend,
        outsider=outsider,
        family=family,
        family_trip=family_trip,
        with_friend=with_friend,
        owner_solo=owner_solo,
        friend_map=friend_map,
        pin_id=pin.json()["id"],
    )


def _patch(world: _World, user: User, json: dict[str, object]):
    return world.client.patch(
        f"/pins/{world.pin_id}", headers=_headers(user, world.settings), json=json
    )


def _current_map(world: _World) -> str:
    response = world.client.get(
        f"/pins/{world.pin_id}", headers=_headers(world.owner, world.settings)
    )
    return response.json()["sanpo_map"]["id"]


class TestMovePinRequiresAllMembers:
    def test_moves_to_map_with_the_same_members(self, world: _World) -> None:
        """移動元と同じ顔ぶれの地図へは移せる（家族で溜めたピンを家族の別の地図へ）。"""
        response = _patch(world, world.owner, {"sanpo_map_id": str(world.family_trip)})

        assert response.status_code == 200
        assert response.json()["sanpo_map"]["id"] == str(world.family_trip)

    def test_moves_to_map_with_additional_members(self, world: _World) -> None:
        """移動先にだけいる人（friend）がいても止めない（公開範囲が広がる移動は許す）。"""
        response = _patch(world, world.partner, {"sanpo_map_id": str(world.with_friend)})

        assert response.status_code == 200
        assert response.json()["sanpo_map"]["id"] == str(world.with_friend)

    def test_owner_cannot_move_to_map_missing_the_creator(self, world: _World) -> None:
        """owner でも、作成者（partner）がいない地図へは移せない（決定33 では許していた）。"""
        response = _patch(world, world.owner, {"sanpo_map_id": str(world.owner_solo)})

        assert response.status_code == 403
        assert response.json() == {
            "detail": "Destination sanpo map is missing members of the current sanpo map",
            "code": "move_target_missing_members",
        }
        assert _current_map(world) == str(world.family)

    def test_cannot_move_to_others_map_missing_a_member(self, world: _World) -> None:
        """呼んだ人が editor の地図でも、移動元のメンバー（partner）がいなければ移せない。"""
        response = _patch(world, world.owner, {"sanpo_map_id": str(world.friend_map)})

        assert response.status_code == 403
        assert response.json()["code"] == "move_target_missing_members"

    def test_rejection_rolls_back_other_fields(self, world: _World) -> None:
        """403 のときは同じリクエストのほかの変更も反映しない（決定20）。"""
        response = _patch(
            world,
            world.owner,
            {"name": "変更", "visited": True, "sanpo_map_id": str(world.owner_solo)},
        )

        assert response.status_code == 403
        pin = world.client.get(
            f"/pins/{world.pin_id}", headers=_headers(world.owner, world.settings)
        ).json()
        assert (pin["name"], pin["visited"], pin["sanpo_map"]["id"]) == (
            "公園",
            False,
            str(world.family),
        )

    def test_role_denial_takes_precedence_and_has_no_code(
        self, world: _World, db_session: Session
    ) -> None:
        """作成者でない editor の移動は、メンバーの条件より先に role の 403（`code` 無し）。"""
        _add_editors(db_session, world.family, world.friend)
        response = _patch(world, world.friend, {"sanpo_map_id": str(world.friend_map)})

        assert response.status_code == 403
        assert response.json() == {"detail": "Permission denied"}

    def test_same_map_is_not_checked(self, world: _World) -> None:
        """今の地図と同じ ID を送っても、メンバーの条件では止めない（自明に満たす）。"""
        response = _patch(world, world.partner, {"sanpo_map_id": str(world.family)})

        assert response.status_code == 200


class TestListPinMoveTargets:
    @staticmethod
    def _get(world: _World, user: User):
        return world.client.get(
            f"/pins/{world.pin_id}/move-targets", headers=_headers(user, world.settings)
        )

    def test_lists_my_other_maps_with_member_differences(self, world: _World) -> None:
        response = self._get(world, world.owner)

        assert response.status_code == 200
        items = {item["sanpo_map_id"]: item for item in response.json()["items"]}
        # 今の地図（family）は含まない。owner が member の地図だけ。
        assert set(items) == {
            str(world.family_trip),
            str(world.with_friend),
            str(world.owner_solo),
            str(world.friend_map),
        }
        partner = {"user_id": str(world.partner.id), "display_name": "mm-partner"}
        friend = {"user_id": str(world.friend.id), "display_name": "mm-friend"}
        assert items[str(world.family_trip)] == {
            "sanpo_map_id": str(world.family_trip),
            "missing_members": [],
            "added_members": [],
        }
        assert items[str(world.with_friend)]["missing_members"] == []
        assert items[str(world.with_friend)]["added_members"] == [friend]
        assert items[str(world.owner_solo)]["missing_members"] == [partner]
        assert items[str(world.owner_solo)]["added_members"] == []
        assert items[str(world.friend_map)]["missing_members"] == [partner]
        assert items[str(world.friend_map)]["added_members"] == [friend]

    def test_order_follows_sanpo_map_list(self, world: _World) -> None:
        maps = world.client.get(
            "/sanpo-maps", headers=_headers(world.partner, world.settings)
        ).json()["items"]
        expected = [m["id"] for m in maps if m["id"] != str(world.family)]

        response = self._get(world, world.partner)

        assert [item["sanpo_map_id"] for item in response.json()["items"]] == expected

    def test_member_without_display_name_is_null(self, world: _World, db_session: Session) -> None:
        world.partner.display_name = None
        db_session.commit()

        response = self._get(world, world.owner)

        items = {item["sanpo_map_id"]: item for item in response.json()["items"]}
        assert items[str(world.owner_solo)]["missing_members"] == [
            {"user_id": str(world.partner.id), "display_name": None}
        ]

    def test_non_member_gets_404(self, world: _World) -> None:
        response = self._get(world, world.outsider)

        assert response.status_code == 404
        assert response.json()["code"] == "pin_not_found"

    def test_requires_authentication(self, world: _World) -> None:
        response = world.client.get(f"/pins/{world.pin_id}/move-targets")

        assert response.status_code == 401


class TestHasMembersMissingFrom:
    def test_detects_members_missing_from_target(self, world: _World, db_session: Session) -> None:
        repository = SanpoMapRepository(db_session)

        assert repository.has_members_missing_from(
            source_sanpo_map_id=world.family, target_sanpo_map_id=world.owner_solo
        )
        assert not repository.has_members_missing_from(
            source_sanpo_map_id=world.family, target_sanpo_map_id=world.family_trip
        )
        # 移動先にだけいる人は関係しない。逆向きは friend が足りない。
        assert not repository.has_members_missing_from(
            source_sanpo_map_id=world.family, target_sanpo_map_id=world.with_friend
        )
        assert repository.has_members_missing_from(
            source_sanpo_map_id=world.with_friend, target_sanpo_map_id=world.family
        )

import uuid
from dataclasses import dataclass

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from sanposcape.auth.tokens import create_access_token
from sanposcape.config import Settings
from sanposcape.integrations.aws.s3 import FakeObjectStorage
from sanposcape.sanpo_maps.conftest import (
    add_map_member,
    create_pin_photo_row,
    make_extra_sanpo_map,
    make_sanpo_map,
    make_user,
)
from sanposcape.sanpo_maps.models import SanpoMapMember
from sanposcape.users.models import User

_FAKE_STORAGE_SETTINGS = Settings(
    env="test",
    auth_mode="real",
    auth_jwt_secret="x" * 32,
    google_allowed_audiences=["test-audience"],
    storage_mode="fake",
)


def _auth_headers_for(user: User) -> dict[str, str]:
    """`fake_storage_client` の JWT シークレットと揃えた設定でトークンを発行する
    （`TestListPins.test_editor_member_can_list_pins` と同じ流儀）。
    """
    token, _ = create_access_token(user_id=user.id, settings=_FAKE_STORAGE_SETTINGS)
    return {"Authorization": f"Bearer {token}"}


@dataclass
class _PermissionWorld:
    client: TestClient
    storage: FakeObjectStorage
    owner: User
    editor_a: User
    editor_b: User
    outsider: User
    pin_by_owner_id: str
    pin_by_editor_a_id: str
    owner_tag_id: str
    editor_a_tag_id: str
    owner_photo_id: str
    editor_a_photo_id: str


class TestPinEditPermissionMatrix:
    """ADR-009 決定19 の権限マトリクスを router レベルで固定する。"""

    @pytest.fixture
    def world(
        self, fake_storage_client: tuple[TestClient, FakeObjectStorage], db_session: Session
    ) -> _PermissionWorld:
        client, storage = fake_storage_client
        owner = make_user(db_session, subject="perm-owner")
        editor_a = make_user(db_session, subject="perm-editor-a")
        editor_b = make_user(db_session, subject="perm-editor-b")
        outsider = make_user(db_session, subject="perm-outsider")
        sanpo_map_id = make_sanpo_map(db_session, owner_user_id=owner.id)
        db_session.add(
            SanpoMapMember(sanpo_map_id=sanpo_map_id, user_id=editor_a.id, role="editor")
        )
        db_session.add(
            SanpoMapMember(sanpo_map_id=sanpo_map_id, user_id=editor_b.id, role="editor")
        )
        db_session.commit()
        make_sanpo_map(db_session, owner_user_id=outsider.id)  # outsider の別地図

        owner_headers = _auth_headers_for(owner)
        editor_a_headers = _auth_headers_for(editor_a)

        pin_by_owner = client.post(
            "/pins",
            headers=owner_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "sanpo_map_id": str(sanpo_map_id),
                "location": {"latitude": 0, "longitude": 0},
            },
        ).json()

        pin_by_editor_a = client.post(
            "/pins",
            headers=editor_a_headers,
            json={
                "client_pin_id": str(uuid.uuid4()),
                "sanpo_map_id": str(sanpo_map_id),
                "location": {"latitude": 0, "longitude": 0},
                "name": "元の名前",
            },
        ).json()
        pin_by_editor_a_id = pin_by_editor_a["id"]

        owner_tag_response = client.patch(
            f"/pins/{pin_by_editor_a_id}",
            headers=owner_headers,
            json={"add_tags": ["owner-tag"]},
        )
        assert owner_tag_response.status_code == 200
        owner_tag_id = next(
            tag["id"] for tag in owner_tag_response.json()["tags"] if tag["label"] == "owner-tag"
        )

        editor_a_tag_response = client.patch(
            f"/pins/{pin_by_editor_a_id}",
            headers=editor_a_headers,
            json={"add_tags": ["editor-tag"]},
        )
        assert editor_a_tag_response.status_code == 200
        editor_a_tag_id = next(
            tag["id"]
            for tag in editor_a_tag_response.json()["tags"]
            if tag["label"] == "editor-tag"
        )

        owner_photo = create_pin_photo_row(
            db_session,
            storage,
            pin_id=uuid.UUID(pin_by_editor_a_id),
            uploaded_by_user_id=owner.id,
            position=0,
        )
        editor_a_photo = create_pin_photo_row(
            db_session,
            storage,
            pin_id=uuid.UUID(pin_by_editor_a_id),
            uploaded_by_user_id=editor_a.id,
            position=1,
        )

        return _PermissionWorld(
            client=client,
            storage=storage,
            owner=owner,
            editor_a=editor_a,
            editor_b=editor_b,
            outsider=outsider,
            pin_by_owner_id=pin_by_owner["id"],
            pin_by_editor_a_id=pin_by_editor_a_id,
            owner_tag_id=owner_tag_id,
            editor_a_tag_id=editor_a_tag_id,
            owner_photo_id=str(owner_photo.id),
            editor_a_photo_id=str(editor_a_photo.id),
        )

    @pytest.mark.parametrize(
        ("actor_name", "expected_status"),
        [("owner", 200), ("editor_a", 200), ("editor_b", 403), ("outsider", 404)],
    )
    def test_update_name_on_editor_a_pin(
        self, world: _PermissionWorld, actor_name: str, expected_status: int
    ) -> None:
        actor: User = getattr(world, actor_name)
        response = world.client.patch(
            f"/pins/{world.pin_by_editor_a_id}",
            headers=_auth_headers_for(actor),
            json={"name": "更新後"},
        )
        assert response.status_code == expected_status
        if expected_status != 200:
            unchanged = world.client.get(
                f"/pins/{world.pin_by_editor_a_id}", headers=_auth_headers_for(world.owner)
            )
            assert unchanged.json()["name"] == "元の名前"

    @pytest.mark.parametrize(
        ("actor_name", "expected_status"),
        [("owner", 204), ("editor_a", 204), ("editor_b", 403), ("outsider", 404)],
    )
    def test_delete_pin_by_editor_a(
        self, world: _PermissionWorld, actor_name: str, expected_status: int
    ) -> None:
        actor: User = getattr(world, actor_name)
        response = world.client.delete(
            f"/pins/{world.pin_by_editor_a_id}", headers=_auth_headers_for(actor)
        )
        assert response.status_code == expected_status
        if expected_status == 403:
            still_there = world.client.get(
                f"/pins/{world.pin_by_editor_a_id}", headers=_auth_headers_for(world.owner)
            )
            assert still_there.status_code == 200

    @pytest.mark.parametrize(
        ("actor_name", "expected_status"),
        [("owner", 200), ("editor_a", 200), ("editor_b", 200), ("outsider", 404)],
    )
    def test_add_tag(self, world: _PermissionWorld, actor_name: str, expected_status: int) -> None:
        actor: User = getattr(world, actor_name)
        response = world.client.patch(
            f"/pins/{world.pin_by_editor_a_id}",
            headers=_auth_headers_for(actor),
            json={"add_tags": [f"tag-by-{actor_name}"]},
        )
        assert response.status_code == expected_status

    def test_owner_can_remove_editor_a_tag(self, world: _PermissionWorld) -> None:
        response = world.client.patch(
            f"/pins/{world.pin_by_editor_a_id}",
            headers=_auth_headers_for(world.owner),
            json={"remove_tag_ids": [world.editor_a_tag_id]},
        )
        assert response.status_code == 200

    def test_editor_a_can_remove_own_tag(self, world: _PermissionWorld) -> None:
        response = world.client.patch(
            f"/pins/{world.pin_by_editor_a_id}",
            headers=_auth_headers_for(world.editor_a),
            json={"remove_tag_ids": [world.editor_a_tag_id]},
        )
        assert response.status_code == 200

    def test_editor_a_cannot_remove_owner_tag(self, world: _PermissionWorld) -> None:
        response = world.client.patch(
            f"/pins/{world.pin_by_editor_a_id}",
            headers=_auth_headers_for(world.editor_a),
            json={"remove_tag_ids": [world.owner_tag_id]},
        )
        assert response.status_code == 403

    def test_editor_b_cannot_remove_owner_tag(self, world: _PermissionWorld) -> None:
        response = world.client.patch(
            f"/pins/{world.pin_by_editor_a_id}",
            headers=_auth_headers_for(world.editor_b),
            json={"remove_tag_ids": [world.owner_tag_id]},
        )
        assert response.status_code == 403

    def test_outsider_removing_tag_is_404(self, world: _PermissionWorld) -> None:
        response = world.client.patch(
            f"/pins/{world.pin_by_editor_a_id}",
            headers=_auth_headers_for(world.outsider),
            json={"remove_tag_ids": [world.owner_tag_id]},
        )
        assert response.status_code == 404

    def test_owner_can_delete_editor_a_photo(self, world: _PermissionWorld) -> None:
        response = world.client.delete(
            f"/pins/{world.pin_by_editor_a_id}/photos/{world.editor_a_photo_id}",
            headers=_auth_headers_for(world.owner),
        )
        assert response.status_code == 204

    def test_editor_a_can_delete_own_photo(self, world: _PermissionWorld) -> None:
        response = world.client.delete(
            f"/pins/{world.pin_by_editor_a_id}/photos/{world.editor_a_photo_id}",
            headers=_auth_headers_for(world.editor_a),
        )
        assert response.status_code == 204

    def test_editor_a_cannot_delete_owner_photo(self, world: _PermissionWorld) -> None:
        response = world.client.delete(
            f"/pins/{world.pin_by_editor_a_id}/photos/{world.owner_photo_id}",
            headers=_auth_headers_for(world.editor_a),
        )
        assert response.status_code == 403

    def test_editor_b_cannot_delete_owner_photo(self, world: _PermissionWorld) -> None:
        response = world.client.delete(
            f"/pins/{world.pin_by_editor_a_id}/photos/{world.owner_photo_id}",
            headers=_auth_headers_for(world.editor_b),
        )
        assert response.status_code == 403

    def test_outsider_deleting_photo_is_404(self, world: _PermissionWorld) -> None:
        response = world.client.delete(
            f"/pins/{world.pin_by_editor_a_id}/photos/{world.owner_photo_id}",
            headers=_auth_headers_for(world.outsider),
        )
        assert response.status_code == 404

    def test_other_pins_photo_id_is_404_even_for_a_member(self, world: _PermissionWorld) -> None:
        """`pin_by_owner` の member（owner 自身）であっても、`pin_by_editor_a` の写真 ID を
        `pin_by_owner` に対して指定すると 404（ADR-009 決定21）。
        """
        response = world.client.delete(
            f"/pins/{world.pin_by_owner_id}/photos/{world.editor_a_photo_id}",
            headers=_auth_headers_for(world.owner),
        )
        assert response.status_code == 404

    def test_partial_permission_failure_does_not_apply_any_change(
        self, world: _PermissionWorld
    ) -> None:
        """`name` の権限が無い editor_b が `name` と `add_tags` を同時に送ると、
        タグも追加されない（原子性）。
        """
        response = world.client.patch(
            f"/pins/{world.pin_by_editor_a_id}",
            headers=_auth_headers_for(world.editor_b),
            json={"name": "乗っ取り", "add_tags": ["snuck-in"]},
        )
        assert response.status_code == 403

        unchanged = world.client.get(
            f"/pins/{world.pin_by_editor_a_id}", headers=_auth_headers_for(world.owner)
        )
        body = unchanged.json()
        assert body["name"] == "元の名前"
        assert "snuck-in" not in {tag["label"] for tag in body["tags"]}

    @pytest.mark.parametrize(
        ("actor_name", "expected_status"),
        [("owner", 200), ("editor_a", 200), ("editor_b", 200), ("outsider", 404)],
    )
    def test_update_visited_on_editor_a_pin(
        self, world: _PermissionWorld, actor_name: str, expected_status: int
    ) -> None:
        """訪問状況はメンバーなら誰でも変更できる（ADR-009 決定32）。"""
        actor: User = getattr(world, actor_name)
        response = world.client.patch(
            f"/pins/{world.pin_by_editor_a_id}",
            headers=_auth_headers_for(actor),
            json={"visited": True},
        )
        assert response.status_code == expected_status

    @pytest.mark.parametrize(
        ("actor_name", "expected_status"),
        [("owner", 200), ("editor_a", 200), ("editor_b", 403), ("outsider", 404)],
    )
    def test_update_archived_on_editor_a_pin(
        self, world: _PermissionWorld, actor_name: str, expected_status: int
    ) -> None:
        """アーカイブは地図 owner かピン作成者のみ（作成者でない editor は 403）。"""
        actor: User = getattr(world, actor_name)
        response = world.client.patch(
            f"/pins/{world.pin_by_editor_a_id}",
            headers=_auth_headers_for(actor),
            json={"archived": True},
        )
        assert response.status_code == expected_status
        if expected_status != 200:
            unchanged = world.client.get(
                f"/pins/{world.pin_by_editor_a_id}", headers=_auth_headers_for(world.owner)
            )
            assert unchanged.json()["archived"] is False

    def test_editor_b_archived_forbidden_applies_no_visited_change(
        self, world: _PermissionWorld
    ) -> None:
        """`archived` の権限が無い editor_b が `visited` と同時に送ると、`visited` も
        反映されない（1つでも権限が無ければ全体 403）。
        """
        response = world.client.patch(
            f"/pins/{world.pin_by_editor_a_id}",
            headers=_auth_headers_for(world.editor_b),
            json={"visited": True, "archived": True},
        )
        assert response.status_code == 403

        unchanged = world.client.get(
            f"/pins/{world.pin_by_editor_a_id}", headers=_auth_headers_for(world.owner)
        )
        assert unchanged.json()["visited"] is False
        assert unchanged.json()["archived"] is False

    @pytest.mark.parametrize("same_value", [False, True])
    def test_editor_b_archived_same_value_is_still_forbidden(
        self, world: _PermissionWorld, same_value: bool
    ) -> None:
        """権限は「送ったフィールド」で判定する（値が今と同じでも 403）。"""
        headers_owner = _auth_headers_for(world.owner)
        if same_value:
            archived = world.client.patch(
                f"/pins/{world.pin_by_editor_a_id}", headers=headers_owner, json={"archived": True}
            )
            assert archived.status_code == 200
        response = world.client.patch(
            f"/pins/{world.pin_by_editor_a_id}",
            headers=_auth_headers_for(world.editor_b),
            json={"archived": same_value},
        )
        assert response.status_code == 403


@dataclass
class _MoveWorld:
    client: TestClient
    storage: FakeObjectStorage
    owner: User
    editor_a: User
    editor_b: User
    outsider: User
    shared_map: uuid.UUID  # owner の地図。editor_a / editor_b が editor
    owner_only_map: uuid.UUID
    editor_a_only_map: uuid.UUID
    editor_b_only_map: uuid.UUID
    other_owner_map: uuid.UUID  # 別 owner の地図。owner・editor_a・editor_b が editor（決定42）
    other_owner: User
    pin_by_editor_a_id: str


class TestPinMovePermissionMatrix:
    """ピンの地図の移動の権限（ADR-009 決定33・42）を router レベルで固定する。"""

    @pytest.fixture
    def world(
        self, fake_storage_client: tuple[TestClient, FakeObjectStorage], db_session: Session
    ) -> _MoveWorld:
        client, storage = fake_storage_client
        owner = make_user(db_session, subject="mv-owner")
        editor_a = make_user(db_session, subject="mv-editor-a")
        editor_b = make_user(db_session, subject="mv-editor-b")
        outsider = make_user(db_session, subject="mv-outsider")
        other_owner = make_user(db_session, subject="mv-other-owner")

        shared_map = make_sanpo_map(db_session, owner_user_id=owner.id)
        add_map_member(db_session, sanpo_map_id=shared_map, user_id=editor_a.id, role="editor")
        add_map_member(db_session, sanpo_map_id=shared_map, user_id=editor_b.id, role="editor")
        owner_only_map = make_extra_sanpo_map(db_session, owner_user_id=owner.id, name="O")
        editor_a_only_map = make_sanpo_map(db_session, owner_user_id=editor_a.id)
        editor_b_only_map = make_sanpo_map(db_session, owner_user_id=editor_b.id)
        other_owner_map = make_sanpo_map(db_session, owner_user_id=other_owner.id)
        for member in (owner, editor_a, editor_b):  # shared_map の全員がいる移動先（決定42）
            add_map_member(
                db_session, sanpo_map_id=other_owner_map, user_id=member.id, role="editor"
            )

        pin = client.post(
            "/pins",
            headers=_auth_headers_for(editor_a),
            json={
                "client_pin_id": str(uuid.uuid4()),
                "sanpo_map_id": str(shared_map),
                "location": {"latitude": 0, "longitude": 0},
                "name": "元の名前",
            },
        ).json()
        return _MoveWorld(
            client=client,
            storage=storage,
            owner=owner,
            editor_a=editor_a,
            editor_b=editor_b,
            outsider=outsider,
            shared_map=shared_map,
            owner_only_map=owner_only_map,
            editor_a_only_map=editor_a_only_map,
            editor_b_only_map=editor_b_only_map,
            other_owner_map=other_owner_map,
            other_owner=other_owner,
            pin_by_editor_a_id=pin["id"],
        )

    @staticmethod
    def _patch(world: _MoveWorld, user: User, json: dict[str, object], pin_id: str | None = None):
        return world.client.patch(
            f"/pins/{pin_id or world.pin_by_editor_a_id}",
            headers=_auth_headers_for(user),
            json=json,
        )

    @staticmethod
    def _get(world: _MoveWorld, user: User, pin_id: str | None = None):
        return world.client.get(
            f"/pins/{pin_id or world.pin_by_editor_a_id}", headers=_auth_headers_for(user)
        )

    def test_owner_cannot_move_editors_pin_to_map_editor_is_not_member_of(
        self, world: _MoveWorld
    ) -> None:
        response = self._patch(world, world.owner, {"sanpo_map_id": str(world.owner_only_map)})

        # editor_a・editor_b が移動先にいないので 403（決定42。決定33 では許していた）。
        assert response.status_code == 403
        assert response.json()["code"] == "move_target_missing_members"
        assert self._get(world, world.editor_a).json()["sanpo_map"]["id"] == str(world.shared_map)

    def test_editor_cannot_move_own_pin_to_own_map(self, world: _MoveWorld) -> None:
        response = self._patch(
            world, world.editor_a, {"sanpo_map_id": str(world.editor_a_only_map)}
        )
        assert response.status_code == 403
        assert response.json()["code"] == "move_target_missing_members"

    def test_editor_can_move_own_pin_to_map_where_editor(self, world: _MoveWorld) -> None:
        response = self._patch(world, world.editor_a, {"sanpo_map_id": str(world.other_owner_map)})

        assert response.status_code == 200
        assert response.json()["sanpo_map"]["id"] == str(world.other_owner_map)

    def test_non_creator_editor_cannot_move_out_and_nothing_changes(
        self, world: _MoveWorld
    ) -> None:
        response = self._patch(
            world, world.editor_b, {"sanpo_map_id": str(world.editor_b_only_map)}
        )

        assert response.status_code == 403
        after = self._get(world, world.owner).json()
        assert after["sanpo_map"]["id"] == str(world.shared_map)

    def test_move_denied_rolls_back_other_allowed_fields(self, world: _MoveWorld) -> None:
        response = self._patch(
            world,
            world.editor_b,
            {"visited": True, "sanpo_map_id": str(world.editor_b_only_map)},
        )

        assert response.status_code == 403
        assert self._get(world, world.owner).json()["visited"] is False

    def test_destination_non_member_is_404_sanpo_map_not_found(self, world: _MoveWorld) -> None:
        response = self._patch(world, world.editor_a, {"sanpo_map_id": str(world.owner_only_map)})

        assert response.status_code == 404
        assert response.json()["code"] == "sanpo_map_not_found"
        assert self._get(world, world.owner).json()["sanpo_map"]["id"] == str(world.shared_map)

    def test_destination_404_wins_over_403(self, world: _MoveWorld) -> None:
        # 作成者でない editor_b が、メンバーでない地図へ移そうとすると 403 ではなく 404。
        response = self._patch(world, world.editor_b, {"sanpo_map_id": str(world.owner_only_map)})

        assert response.status_code == 404
        assert response.json()["code"] == "sanpo_map_not_found"

    def test_outsider_gets_pin_not_found(self, world: _MoveWorld) -> None:
        response = self._patch(world, world.outsider, {"sanpo_map_id": str(world.owner_only_map)})

        assert response.status_code == 404
        assert response.json()["code"] == "pin_not_found"

    def test_photo_delete_after_move_uses_destination_role(
        self, world: _MoveWorld, db_session: Session
    ) -> None:
        photo = create_pin_photo_row(
            db_session,
            world.storage,
            pin_id=uuid.UUID(world.pin_by_editor_a_id),
            uploaded_by_user_id=world.editor_a.id,
            position=0,
        )
        moved = self._patch(world, world.editor_a, {"sanpo_map_id": str(world.other_owner_map)})
        assert moved.status_code == 200

        # 元の owner は移動先では editor なので、他人の写真は消せない（決定42 で移動先にいる）。
        old_owner_delete = world.client.delete(
            f"/pins/{world.pin_by_editor_a_id}/photos/{photo.id}",
            headers=_auth_headers_for(world.owner),
        )
        assert old_owner_delete.status_code == 403
        # 移動先の owner は他人の写真も削除できる。
        new_owner_delete = world.client.delete(
            f"/pins/{world.pin_by_editor_a_id}/photos/{photo.id}",
            headers=_auth_headers_for(world.other_owner),
        )
        assert new_owner_delete.status_code == 204

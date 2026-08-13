import uuid
from datetime import UTC, datetime, timedelta

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from sanposcape.auth.tokens import create_access_token
from sanposcape.config import Settings
from sanposcape.main import app
from sanposcape.users.models import User
from sanposcape.walks.schemas import MAX_TRACK_POINTS
from sanposcape.walks.tests.conftest import STATS_ANCHOR_JST, make_user, seed_walk


def _iso(dt: datetime) -> str:
    return dt.isoformat()


def _payload(
    *,
    client_walk_id: uuid.UUID | None = None,
    started_at: datetime | None = None,
    ended_at: datetime | None = None,
    duration_seconds: int = 590,
    distance_meters: int = 1200,
    track: list[dict] | None = None,
) -> dict:
    if ended_at is None:
        ended_at = datetime.now(UTC) - timedelta(minutes=1)
    if started_at is None:
        started_at = ended_at - timedelta(minutes=10)
    return {
        "client_walk_id": str(client_walk_id or uuid.uuid4()),
        "started_at": _iso(started_at),
        "ended_at": _iso(ended_at),
        "duration_seconds": duration_seconds,
        "distance_meters": distance_meters,
        "destination": {
            "place_id": "place-1",
            "name": "テスト公園",
            "location": {"latitude": 35.68, "longitude": 139.76},
        },
        "track": track if track is not None else [{"latitude": 35.68, "longitude": 139.76}],
    }


class TestCreateWalk:
    def test_creates_walk_and_returns_201(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = walks_client.post("/walks", json=_payload(), headers=auth_headers)

        assert response.status_code == 201, response.text
        body = response.json()
        assert body["distance_meters"] == 1200
        assert "track" not in body  # 一覧・作成レスポンスは軌跡を含まない

    def test_resend_with_same_client_walk_id_returns_200_with_same_id(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        payload = _payload()

        first = walks_client.post("/walks", json=payload, headers=auth_headers)
        second = walks_client.post("/walks", json=payload, headers=auth_headers)

        assert first.status_code == 201
        assert second.status_code == 200
        assert first.json()["id"] == second.json()["id"]

    def test_missing_authorization_returns_401(self, walks_client: TestClient) -> None:
        response = walks_client.post("/walks", json=_payload())

        assert response.status_code == 401
        assert response.headers["WWW-Authenticate"] == "Bearer"

    def test_expired_access_token_returns_401(
        self, walks_client: TestClient, test_settings: Settings
    ) -> None:
        token, _ = create_access_token(
            user_id=uuid.uuid4(),
            settings=test_settings,
            now=datetime.now(UTC)
            - timedelta(seconds=test_settings.auth_access_token_ttl_seconds + 1),
        )

        response = walks_client.post(
            "/walks", json=_payload(), headers={"Authorization": f"Bearer {token}"}
        )

        assert response.status_code == 401

    def test_ended_at_before_started_at_returns_422(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        now = datetime.now(UTC) - timedelta(minutes=1)
        response = walks_client.post(
            "/walks",
            json=_payload(started_at=now, ended_at=now - timedelta(minutes=10)),
            headers=auth_headers,
        )

        assert response.status_code == 422

    def test_naive_datetime_returns_422(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        payload = _payload()
        payload["started_at"] = "2026-08-01T09:00:00"  # tz なし
        payload["ended_at"] = "2026-08-01T09:10:00"

        response = walks_client.post("/walks", json=payload, headers=auth_headers)

        assert response.status_code == 422

    def test_track_over_max_points_returns_422(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        track = [{"latitude": 35.68, "longitude": 139.76}] * (MAX_TRACK_POINTS + 1)

        response = walks_client.post("/walks", json=_payload(track=track), headers=auth_headers)

        assert response.status_code == 422

    def test_track_at_max_points_returns_201(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        """B-1: `Field(max_length=MAX_TRACK_POINTS)` の off-by-one を固定する境界値テスト。"""
        track = [{"latitude": 35.68, "longitude": 139.76}] * MAX_TRACK_POINTS

        response = walks_client.post("/walks", json=_payload(track=track), headers=auth_headers)

        assert response.status_code == 201, response.text

    def test_empty_track_returns_201(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        """B-1: 位置情報の権限拒否・取得失敗時も記録は残す仕様（D2/D5の前提）を e2e で固定する。"""
        response = walks_client.post("/walks", json=_payload(track=[]), headers=auth_headers)

        assert response.status_code == 201, response.text

    def test_future_ended_at_returns_422(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        ended_at = datetime.now(UTC) + timedelta(hours=1)
        response = walks_client.post(
            "/walks",
            json=_payload(started_at=ended_at - timedelta(minutes=10), ended_at=ended_at),
            headers=auth_headers,
        )

        assert response.status_code == 422

    def test_oversized_body_returns_413(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        oversized_body = b"a" * (1_048_576 + 1)

        response = walks_client.post(
            "/walks",
            content=oversized_body,
            headers={**auth_headers, "Content-Type": "application/json"},
        )

        assert response.status_code == 413


class TestListWalks:
    def test_only_returns_own_walks(
        self,
        walks_client: TestClient,
        auth_headers: dict[str, str],
        test_settings: Settings,
        db_session: Session,
    ) -> None:
        walks_client.post("/walks", json=_payload(), headers=auth_headers)

        other_user = make_user(db_session, subject="other-list-user")
        other_token, _ = create_access_token(user_id=other_user.id, settings=test_settings)
        walks_client.post(
            "/walks", json=_payload(), headers={"Authorization": f"Bearer {other_token}"}
        )

        own_response = walks_client.get("/walks", headers=auth_headers)

        assert own_response.status_code == 200
        assert len(own_response.json()["items"]) == 1

    def test_missing_authorization_returns_401(self, walks_client: TestClient) -> None:
        response = walks_client.get("/walks")

        assert response.status_code == 401

    def test_pagination_round_trip(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        base = datetime.now(UTC) - timedelta(days=1)
        created_ids = []
        for i in range(3):
            res = walks_client.post(
                "/walks",
                json=_payload(started_at=base + timedelta(minutes=i)),
                headers=auth_headers,
            )
            created_ids.append(res.json()["id"])

        first_page = walks_client.get("/walks?limit=2", headers=auth_headers)
        assert first_page.status_code == 200
        first_body = first_page.json()
        assert len(first_body["items"]) == 2
        assert first_body["next_cursor"] is not None

        second_page = walks_client.get(
            f"/walks?limit=2&cursor={first_body['next_cursor']}", headers=auth_headers
        )
        assert second_page.status_code == 200
        second_body = second_page.json()
        assert len(second_body["items"]) == 1
        assert second_body["next_cursor"] is None

        all_ids = {item["id"] for item in first_body["items"] + second_body["items"]}
        assert all_ids == set(created_ids)

    def test_invalid_cursor_returns_400(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = walks_client.get("/walks?cursor=not-a-valid-cursor", headers=auth_headers)

        assert response.status_code == 400

    def test_naive_started_after_returns_422(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        """A-1: tz オフセットなしのクエリパラメータはサイレントに誤変換されず 422 で弾く。"""
        response = walks_client.get(
            "/walks?started_after=2026-08-01T09:00:00", headers=auth_headers
        )

        assert response.status_code == 422

    def test_naive_started_before_returns_422(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = walks_client.get(
            "/walks?started_before=2026-08-01T09:00:00", headers=auth_headers
        )

        assert response.status_code == 422


class TestGetWalk:
    def test_returns_detail_with_track(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        create_response = walks_client.post("/walks", json=_payload(), headers=auth_headers)
        walk_id = create_response.json()["id"]

        response = walks_client.get(f"/walks/{walk_id}", headers=auth_headers)

        assert response.status_code == 200
        body = response.json()
        assert body["track"] == [{"latitude": 35.68, "longitude": 139.76}]

    def test_missing_authorization_returns_401(self, walks_client: TestClient) -> None:
        response = walks_client.get(f"/walks/{uuid.uuid4()}")

        assert response.status_code == 401

    def test_unknown_walk_id_returns_404(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = walks_client.get(f"/walks/{uuid.uuid4()}", headers=auth_headers)

        assert response.status_code == 404

    def test_other_users_walk_returns_404(
        self,
        walks_client: TestClient,
        auth_headers: dict[str, str],
        test_settings: Settings,
        db_session: Session,
    ) -> None:
        create_response = walks_client.post("/walks", json=_payload(), headers=auth_headers)
        walk_id = create_response.json()["id"]

        other_user = make_user(db_session, subject="other-walks-user")
        other_token, _ = create_access_token(user_id=other_user.id, settings=test_settings)

        response = walks_client.get(
            f"/walks/{walk_id}", headers={"Authorization": f"Bearer {other_token}"}
        )

        assert response.status_code == 404


class TestDeleteWalk:
    def test_d_t1_deletes_own_walk_and_returns_204_with_empty_body(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        create_response = walks_client.post("/walks", json=_payload(), headers=auth_headers)
        walk_id = create_response.json()["id"]

        response = walks_client.delete(f"/walks/{walk_id}", headers=auth_headers)

        assert response.status_code == 204, response.text
        assert response.content == b""

    def test_d_t2_get_after_delete_returns_404(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        create_response = walks_client.post("/walks", json=_payload(), headers=auth_headers)
        walk_id = create_response.json()["id"]

        walks_client.delete(f"/walks/{walk_id}", headers=auth_headers)
        response = walks_client.get(f"/walks/{walk_id}", headers=auth_headers)

        assert response.status_code == 404

    def test_d_t3_deleted_walk_disappears_from_list(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        create_response = walks_client.post("/walks", json=_payload(), headers=auth_headers)
        walk_id = create_response.json()["id"]

        walks_client.delete(f"/walks/{walk_id}", headers=auth_headers)
        response = walks_client.get("/walks", headers=auth_headers)

        assert response.status_code == 200
        assert walk_id not in {item["id"] for item in response.json()["items"]}

    def test_d_t4_delete_reflected_in_stats(
        self,
        frozen_stats_client: TestClient,
        auth_headers: dict[str, str],
        db_session: Session,
        authenticated_user: User,
    ) -> None:
        walk = seed_walk(db_session, user_id=authenticated_user.id, started_at=STATS_ANCHOR_JST)
        before = frozen_stats_client.get("/walks/stats", headers=auth_headers)
        assert before.json()["today"]["walk_count"] == 1

        delete_response = frozen_stats_client.delete(f"/walks/{walk.id}", headers=auth_headers)
        after = frozen_stats_client.get("/walks/stats", headers=auth_headers)

        assert delete_response.status_code == 204
        assert after.json()["today"]["walk_count"] == 0

    def test_d_t5_other_users_walk_returns_404_and_owner_can_still_get_it(
        self,
        walks_client: TestClient,
        auth_headers: dict[str, str],
        test_settings: Settings,
        db_session: Session,
    ) -> None:
        create_response = walks_client.post("/walks", json=_payload(), headers=auth_headers)
        walk_id = create_response.json()["id"]

        other_user = make_user(db_session, subject="other-delete-user")
        other_token, _ = create_access_token(user_id=other_user.id, settings=test_settings)

        delete_response = walks_client.delete(
            f"/walks/{walk_id}", headers={"Authorization": f"Bearer {other_token}"}
        )
        get_response = walks_client.get(f"/walks/{walk_id}", headers=auth_headers)

        assert delete_response.status_code == 404
        assert get_response.status_code == 200

    def test_d_t6_unknown_walk_id_returns_404(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = walks_client.delete(f"/walks/{uuid.uuid4()}", headers=auth_headers)

        assert response.status_code == 404

    def test_d_t7_second_delete_returns_404_not_idempotent(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        create_response = walks_client.post("/walks", json=_payload(), headers=auth_headers)
        walk_id = create_response.json()["id"]

        first = walks_client.delete(f"/walks/{walk_id}", headers=auth_headers)
        second = walks_client.delete(f"/walks/{walk_id}", headers=auth_headers)

        assert first.status_code == 204
        assert second.status_code == 404

    def test_d_t8_missing_authorization_returns_401(self, walks_client: TestClient) -> None:
        response = walks_client.delete(f"/walks/{uuid.uuid4()}")

        assert response.status_code == 401
        assert response.headers["WWW-Authenticate"] == "Bearer"

    def test_d_t9_non_uuid_walk_id_returns_422(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = walks_client.delete("/walks/not-a-uuid", headers=auth_headers)

        assert response.status_code == 422

    def test_d_t10_openapi_contract(self) -> None:
        operation = app.openapi()["paths"]["/walks/{walk_id}"]["delete"]

        assert "204" in operation["responses"]
        assert "401" in operation["responses"]
        assert "404" in operation["responses"]
        assert operation["security"] == [{"HTTPBearer": []}]

    def test_d_t11_resending_the_same_client_walk_id_after_delete_recreates_it(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        client_walk_id = uuid.uuid4()
        payload = _payload(client_walk_id=client_walk_id)
        create_response = walks_client.post("/walks", json=payload, headers=auth_headers)
        walk_id = create_response.json()["id"]

        walks_client.delete(f"/walks/{walk_id}", headers=auth_headers)
        resend_response = walks_client.post("/walks", json=payload, headers=auth_headers)

        assert resend_response.status_code == 201, resend_response.text
        assert resend_response.json()["id"] != walk_id

    def test_d_t12_cursor_survives_deletion_of_the_walk_it_pointed_to(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        base = datetime.now(UTC) - timedelta(days=1)
        created_ids = []
        for i in range(3):
            res = walks_client.post(
                "/walks",
                json=_payload(started_at=base + timedelta(minutes=i)),
                headers=auth_headers,
            )
            created_ids.append(res.json()["id"])

        first_page = walks_client.get("/walks?limit=2", headers=auth_headers)
        first_body = first_page.json()
        cursor_walk_id = first_body["items"][-1]["id"]  # cursor の基準になった散歩

        delete_response = walks_client.delete(f"/walks/{cursor_walk_id}", headers=auth_headers)
        second_page = walks_client.get(
            f"/walks?limit=2&cursor={first_body['next_cursor']}", headers=auth_headers
        )

        assert delete_response.status_code == 204
        assert second_page.status_code == 200
        remaining_ids = {item["id"] for item in second_page.json()["items"]}
        assert remaining_ids == set(created_ids) - {cursor_walk_id} - {
            item["id"] for item in first_body["items"]
        }


class TestGetWalkStats:
    def test_t1_returns_200_not_swallowed_by_walk_id_route(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        """回帰テスト: `/stats` が `/{walk_id}` の UUID 検証に落ちて 422 にならないこと
        （router.py の宣言順に依存する。詳細は router.py のコメント参照）。"""
        response = walks_client.get("/walks/stats", headers=auth_headers)

        assert response.status_code == 200, response.text

    def test_t2_openapi_contract(self) -> None:
        operation = app.openapi()["paths"]["/walks/stats"]["get"]

        assert operation["operationId"] == "get_walk_stats_walks_stats_get"
        assert operation["security"] == [{"HTTPBearer": []}]
        assert "401" in operation["responses"]

    def test_t3_missing_authorization_returns_401(self, walks_client: TestClient) -> None:
        response = walks_client.get("/walks/stats")

        assert response.status_code == 401
        assert response.headers["WWW-Authenticate"] == "Bearer"

    def test_t4_response_shape(
        self,
        frozen_stats_client: TestClient,
        auth_headers: dict[str, str],
        db_session: Session,
        authenticated_user: User,
    ) -> None:
        seed_walk(db_session, user_id=authenticated_user.id, started_at=STATS_ANCHOR_JST)

        response = frozen_stats_client.get("/walks/stats", headers=auth_headers)

        assert response.status_code == 200, response.text
        body = response.json()
        assert len(body["week"]["buckets"]) == 7
        assert len(body["month"]["buckets"]) == 4
        assert body["timezone"] == "Asia/Tokyo"
        assert body["today"]["date"] == "2026-03-15"
        assert isinstance(body["streak_days"], int)

    def test_t5_only_returns_own_data(
        self,
        frozen_stats_client: TestClient,
        auth_headers: dict[str, str],
        db_session: Session,
    ) -> None:
        other_user = make_user(db_session, subject="other-stats-user")
        seed_walk(db_session, user_id=other_user.id, started_at=STATS_ANCHOR_JST)

        response = frozen_stats_client.get("/walks/stats", headers=auth_headers)

        assert response.status_code == 200, response.text
        assert response.json()["today"]["walk_count"] == 0

    def test_t6_no_walks_still_returns_200(
        self, walks_client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = walks_client.get("/walks/stats", headers=auth_headers)

        assert response.status_code == 200, response.text

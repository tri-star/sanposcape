from fastapi.testclient import TestClient


def test_create_and_list_spot(client: TestClient) -> None:
    payload = {"name": "テスト公園", "latitude": 35.0, "longitude": 139.0, "category": "park"}

    create_res = client.post("/spots", json=payload)
    assert create_res.status_code == 201
    created = create_res.json()
    assert created["name"] == "テスト公園"
    assert created["id"] > 0

    list_res = client.get("/spots")
    assert list_res.status_code == 200
    spots = list_res.json()
    assert len(spots) == 1
    assert spots[0]["name"] == "テスト公園"


def test_list_spots_empty(client: TestClient) -> None:
    res = client.get("/spots")
    assert res.status_code == 200
    assert res.json() == []

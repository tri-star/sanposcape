"""開発用の初期データ投入スクリプト（Seeder）。

コンテナ内で実行する:
    docker compose exec api uv run python scripts/seed.py
"""

from sqlalchemy import select

from sanposcape.database import get_session_factory
from sanposcape.spots.models import Spot

SEED_SPOTS = [
    {"name": "近所の公園", "latitude": 35.681236, "longitude": 139.767125, "category": "park"},
    {"name": "川沿いの遊歩道", "latitude": 35.685, "longitude": 139.752, "category": "nature"},
    {"name": "老舗の喫茶店", "latitude": 35.69, "longitude": 139.7, "category": "cafe"},
]


def main() -> None:
    db = get_session_factory()()
    try:
        existing = db.scalar(select(Spot).limit(1))
        if existing is not None:
            print("Spots already seeded. Skipping.")
            return

        db.add_all([Spot(**data) for data in SEED_SPOTS])
        db.commit()
        print(f"Seeded {len(SEED_SPOTS)} spots.")
    finally:
        db.close()


if __name__ == "__main__":
    main()

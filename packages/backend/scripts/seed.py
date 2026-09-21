"""開発用の初期データ投入スクリプト（Seeder）。

コンテナ内で実行する:
    docker compose exec api uv run python scripts/seed.py

現時点では投入するデータが無い（骨組みのみ）。地図（SanpoMap）・ピン（Pin）は
ユーザー（User）に紐づくため、認証済みユーザーが居ない状態では意味のある
シードデータを作れない（サンプル `spots` テーブルは SS-88 で削除した）。
将来、シードすべきデータが必要になったらここに追加する。
"""


def main() -> None:
    print("Nothing to seed.")


if __name__ == "__main__":
    main()

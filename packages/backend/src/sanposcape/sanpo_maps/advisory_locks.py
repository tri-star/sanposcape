import uuid


def advisory_lock_key(user_id: uuid.UUID) -> int:
    """UUID を `pg_advisory_xact_lock` の signed int4 キーへ畳み込む（決定的・プロセス非依存）。

    Python 組み込みの `hash()` は `PYTHONHASHSEED` によりプロセスごとに変わりうるため
    使わない（同一ユーザーの同時リクエストが別の Lambda 実行環境で処理された場合に
    ロックが効かなくなる）。128bit を32bit ずつ XOR で畳み込むだけなので衝突はあり得るが、
    無関係なユーザー同士がまれに同じロックを共有するだけで、ロックの正しさ
    （同一ユーザーの同時リクエストを直列化する）は損なわれない。

    `maps/repository.py`（owner 単位）・`photos/repository.py`（pin_photo_uploads 単位）が
    それぞれ独自の namespace 定数を持ちつつ、この関数を共有する（ADR-011。旧 `pins`/
    `sanpo_maps` の両 repository にあった重複実装を統合した）。
    """
    raw = user_id.int
    key = 0
    for shift in range(0, 128, 32):
        key ^= (raw >> shift) & 0xFFFFFFFF
    if key >= 2**31:
        key -= 2**32
    return key

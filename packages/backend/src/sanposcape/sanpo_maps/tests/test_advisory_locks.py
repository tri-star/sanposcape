import uuid

from sanposcape.sanpo_maps.advisory_locks import advisory_lock_key


class TestAdvisoryLockKey:
    def test_matches_golden_values_from_before_the_shared_extraction(self) -> None:
        """`maps/repository.py`・`photos/repository.py` にそれぞれ複製されていた旧実装
        （SS-137 で `advisory_locks.py` に統合）と同じ値を返すことを固定する。値は
        `advisory_lock_key()` の実装から独立して算出したゴールデン値（ADR-011）。
        """
        cases = {
            uuid.UUID("3fa85f64-5717-4562-b3fc-2c963f66afa6"): -467297994,
            uuid.UUID("11111111-2222-3333-4444-555555555555"): 572662306,
            uuid.UUID("a1b2c3d4-e5f6-7890-abcd-ef1234567890"): -606131002,
        }
        for user_id, expected in cases.items():
            assert advisory_lock_key(user_id) == expected

    def test_result_is_within_signed_int4_range(self) -> None:
        """`pg_advisory_xact_lock(int, int)` に渡せる signed int4 の範囲に収まること。"""
        for _ in range(1000):
            user_id = uuid.uuid4()
            key = advisory_lock_key(user_id)
            assert -(2**31) <= key <= 2**31 - 1

    def test_is_deterministic_for_the_same_user_id(self) -> None:
        user_id = uuid.uuid4()
        assert advisory_lock_key(user_id) == advisory_lock_key(user_id)

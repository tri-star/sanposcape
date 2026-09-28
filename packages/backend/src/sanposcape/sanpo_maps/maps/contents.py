"""地図の中身（ピン等）を持つ下位ドメインへの口（ADR-009 決定29, SS-113）。

`sanpo_maps` は `pins` を import しない（folder-structure.md の依存方向）。この
Protocol を `pins/service.py` の `PinService` が構造的部分型で満たし、配線は
アプリ直下 `sanposcape/dependencies.py` の `get_sanpo_map_contents()` が行う。
`sanpo_maps/` 配下（tests 含む）が `sanposcape.pins` を import していないことは
`tests/test_dependency_direction.py` が AST で検査する。
"""

import uuid
from collections.abc import Callable
from typing import Protocol


class SanpoMapContents(Protocol):
    def count_pins_for_sanpo_maps(self, sanpo_map_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
        """`GET /sanpo-maps?expand=pin_count` 用。ピンが無い地図は戻り値の dict に無い
        （呼び出し側は `.get(id, 0)` にする）。読み取りのみ・commit しない。
        """
        ...

    def prepare_sanpo_map_deletion(self, sanpo_map_id: uuid.UUID) -> Callable[[], None]:
        """削除する地図の中身（写真）の後始末を準備し、DB commit 後に呼ぶ関数を返す。

        呼び出し側（`SanpoMapService.delete_map`）が地図行のロック・認可を済ませた
        **後**に呼ぶこと。返した関数は commit 後に呼ばれ、例外を外に出さない
        （best-effort。ADR-009 決定22・決定28）。
        """
        ...

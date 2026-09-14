"""周回ルート（往路と異なる道で戻る）の経由点生成・妥当性判定・候補選択。

DB も HTTP も持たない純粋関数モジュール（`walks/stats.py` と同じ位置づけ。
folder-structure.md 参照）。`integrations/google_maps/provider.py` の
`ProviderPoint` / `ProviderRoute` だけに依存し、Google API のリクエスト/レスポンス形や
FastAPI のスキーマは知らない（呼び出し側の `service.py` がそれらを橋渡しする）。

しきい値・係数は運用で動かす値ではなく、検証（`scripts/loop_route_probe.py`）とコード変更で
決めるものなので env にせずモジュール定数にする（ADR-007 決定3）。
"""

from dataclasses import dataclass
from typing import Literal

from sanposcape.integrations.google_maps.provider import ProviderPoint, ProviderRoute
from sanposcape.maps.geometry import (
    bearing_degrees,
    grid_cells,
    haversine_meters,
    midpoint,
    offset_point,
    resample,
)

LoopSide = Literal["right", "left"]

# --- 経由点生成（決定2） ---
WAYPOINT_OFFSET_RATIO = 0.25
MIN_WAYPOINT_OFFSET_METERS = 80.0
MIN_LOOP_BASE_DISTANCE_METERS = 50.0
_WAYPOINT_COORDINATE_PRECISION = 5

# --- 妥当性判定（決定3） ---
MAX_DETOUR_RATIO = 1.4
MAX_RETURN_OVERLAP_RATIO = 0.5
MAX_RETURN_BACKTRACK_RATIO = 0.15
MAX_VIA_SNAP_DISTANCE_METERS = 250.0

_RESAMPLE_STEP_METERS = 10.0
_GRID_CELL_METERS = 20.0
_BACKTRACK_MIN_GAP_SAMPLES = 8  # 8サンプル ≈ 80m（_RESAMPLE_STEP_METERS 基準）
_EXCLUSION_RADIUS_RATIO = 0.2
_EXCLUSION_RADIUS_MIN_METERS = 30.0
_EXCLUSION_RADIUS_MAX_METERS = 100.0

# score = return_overlap_ratio + _SCORE_DETOUR_WEIGHT * (detour_ratio - 1)
_SCORE_DETOUR_WEIGHT = 0.5


@dataclass(frozen=True)
class LoopCandidate:
    """左右どちらかの経由点。座標は小数5桁に丸め済み（Google へのリクエストとキャッシュキーの
    両方で使うため、生成した時点で丸めておく）。"""

    side: LoopSide
    via: ProviderPoint


@dataclass(frozen=True)
class LoopVerdict:
    """周回候補の妥当性判定の結果。`reason` はログ用の短い識別子（複数条件に抵触した場合は
    `+` で連結する）。座標は含めない。"""

    accepted: bool
    reason: str
    detour_ratio: float
    return_overlap_ratio: float
    return_backtrack_ratio: float
    via_snap_distance_meters: float


@dataclass(frozen=True)
class LoopEvaluation:
    """1つの経由点候補について、取得したルートと判定結果をまとめたもの。"""

    side: LoopSide
    via: ProviderPoint
    outbound: ProviderRoute
    inbound: ProviderRoute
    verdict: LoopVerdict


def loop_waypoint_candidates(
    origin: ProviderPoint, destination: ProviderPoint
) -> tuple[LoopCandidate, ...]:
    """右・左の経由点候補を返す（右→左の順で固定）。

    `origin`・`destination` の直線距離が `MIN_LOOP_BASE_DISTANCE_METERS` 未満なら、
    周回を作る余地がないため空タプルを返す。
    """
    base_distance = haversine_meters(origin, destination)
    if base_distance < MIN_LOOP_BASE_DISTANCE_METERS:
        return ()
    offset_meters = max(WAYPOINT_OFFSET_RATIO * base_distance, MIN_WAYPOINT_OFFSET_METERS)
    bearing = bearing_degrees(origin, destination)
    mid = midpoint(origin, destination)
    right = offset_point(mid, (bearing + 90) % 360, offset_meters)
    left = offset_point(mid, (bearing - 90) % 360, offset_meters)
    return (
        LoopCandidate(side="right", via=_round_waypoint(right)),
        LoopCandidate(side="left", via=_round_waypoint(left)),
    )


def evaluate_loop(
    outbound: ProviderRoute,
    inbound: ProviderRoute,
    via: ProviderPoint,
    origin: ProviderPoint,
    destination: ProviderPoint,
) -> LoopVerdict:
    """往路・復路 leg の組を4指標で判定する（決定3）。"""
    detour_ratio = _detour_ratio(outbound, inbound)

    outbound_samples = resample(outbound.path, _RESAMPLE_STEP_METERS)
    inbound_samples = resample(inbound.path, _RESAMPLE_STEP_METERS)

    return_overlap_ratio = _return_overlap_ratio(
        outbound_samples, inbound_samples, origin, destination
    )
    return_backtrack_ratio = _return_backtrack_ratio(inbound_samples)
    via_snap_distance_meters = _via_snap_distance_meters(via, inbound_samples)

    reasons: list[str] = []
    if detour_ratio > MAX_DETOUR_RATIO:
        reasons.append("detour")
    if return_overlap_ratio > MAX_RETURN_OVERLAP_RATIO:
        reasons.append("overlap")
    if return_backtrack_ratio > MAX_RETURN_BACKTRACK_RATIO:
        reasons.append("backtrack")
    if via_snap_distance_meters > MAX_VIA_SNAP_DISTANCE_METERS:
        reasons.append("snap")

    return LoopVerdict(
        accepted=not reasons,
        reason="+".join(reasons) if reasons else "ok",
        detour_ratio=detour_ratio,
        return_overlap_ratio=return_overlap_ratio,
        return_backtrack_ratio=return_backtrack_ratio,
        via_snap_distance_meters=via_snap_distance_meters,
    )


def select_loop(evaluations: tuple[LoopEvaluation, ...]) -> LoopEvaluation | None:
    """合格した候補の中からスコア最小のものを返す。同点なら `evaluations` で先に出てきた方
    （呼び出し側が right → left の順で渡す想定）。合格が無ければ `None`。"""
    accepted = [evaluation for evaluation in evaluations if evaluation.verdict.accepted]
    if not accepted:
        return None
    return min(accepted, key=_score)


def _score(evaluation: LoopEvaluation) -> float:
    verdict = evaluation.verdict
    return verdict.return_overlap_ratio + _SCORE_DETOUR_WEIGHT * (verdict.detour_ratio - 1)


def _detour_ratio(outbound: ProviderRoute, inbound: ProviderRoute) -> float:
    if outbound.duration_seconds <= 0:
        # 往路の所要時間が 0 になるのは実運用では起きない
        # （MIN_LOOP_BASE_DISTANCE_METERS により最低でも50m分の所要時間がある）。
        # 万一発生した場合は比率が定義できないため、判定を確実に不合格側へ倒す。
        return float("inf")
    return (outbound.duration_seconds + inbound.duration_seconds) / (2 * outbound.duration_seconds)


def _return_overlap_ratio(
    outbound_samples: tuple[ProviderPoint, ...],
    inbound_samples: tuple[ProviderPoint, ...],
    origin: ProviderPoint,
    destination: ProviderPoint,
) -> float:
    if not outbound_samples or not inbound_samples:
        return 0.0
    outbound_cells = _buffered_cells(grid_cells(outbound_samples, origin, _GRID_CELL_METERS))
    base_distance = haversine_meters(origin, destination)
    exclusion_radius = min(
        max(_EXCLUSION_RADIUS_RATIO * base_distance, _EXCLUSION_RADIUS_MIN_METERS),
        _EXCLUSION_RADIUS_MAX_METERS,
    )
    inbound_cells = grid_cells(inbound_samples, origin, _GRID_CELL_METERS)
    eligible_cells = [
        cell
        for point, cell in zip(inbound_samples, inbound_cells, strict=True)
        if haversine_meters(point, origin) > exclusion_radius
        and haversine_meters(point, destination) > exclusion_radius
    ]
    if not eligible_cells:
        return 0.0
    overlapping = sum(1 for cell in eligible_cells if cell in outbound_cells)
    return overlapping / len(eligible_cells)


def _return_backtrack_ratio(inbound_samples: tuple[ProviderPoint, ...]) -> float:
    if not inbound_samples:
        return 0.0
    # 復路の平面上の基準点は inbound_samples[0]（往路と同じ原点である必要はなく、
    # 復路内で一貫していればよい）。
    anchor = inbound_samples[0]
    cells = grid_cells(inbound_samples, anchor, _GRID_CELL_METERS)
    last_seen_index: dict[tuple[int, int], int] = {}
    backtrack_count = 0
    for index, cell in enumerate(cells):
        previous_index = last_seen_index.get(cell)
        if previous_index is not None and index - previous_index >= _BACKTRACK_MIN_GAP_SAMPLES:
            backtrack_count += 1
        last_seen_index[cell] = index
    return backtrack_count / len(cells)


def _via_snap_distance_meters(
    via: ProviderPoint, inbound_samples: tuple[ProviderPoint, ...]
) -> float:
    if not inbound_samples:
        return float("inf")
    return min(haversine_meters(via, point) for point in inbound_samples)


def _buffered_cells(cells: tuple[tuple[int, int], ...]) -> set[tuple[int, int]]:
    """各セルとその8近傍（約30mバッファ相当）の和集合を返す。"""
    buffered: set[tuple[int, int]] = set()
    for row, col in cells:
        for delta_row in (-1, 0, 1):
            for delta_col in (-1, 0, 1):
                buffered.add((row + delta_row, col + delta_col))
    return buffered


def _round_waypoint(point: ProviderPoint) -> ProviderPoint:
    return ProviderPoint(
        latitude=round(point.latitude, _WAYPOINT_COORDINATE_PRECISION),
        longitude=round(point.longitude, _WAYPOINT_COORDINATE_PRECISION),
    )

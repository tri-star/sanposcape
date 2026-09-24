"""周回ルート生成の実 API 検証スクリプト（ADR-007「実 API 検証」、開発者専用）。

`MAPS_MODE=real` で `GOOGLE_MAPS_SERVER_API_KEY` が設定されているときだけ動く
（`HttpGoogleMapsProvider` と `maps/loop_route.py` をそのまま使う。しきい値・係数は
このスクリプトからは変更しない — `maps/loop_route.py` のモジュール定数を直接編集し、
このスクリプトで再実行して確かめる）。

使い方（コンテナ内、`.env` に実キーを設定してから）:
    docker compose exec api uv run python scripts/loop_route_probe.py

入力: `scripts/loop_route_probe_cases.yaml`（O/D の組とラベル）。検証セットには
川沿い・線路沿い・大きな公園やキャンパスの縁・行き止まりの多い住宅地・郊外の短距離・
都心の格子状の街路など、ADR-007「前回試行の弱点」の表が出やすい地形を含めること。

候補（右/左）の取得は本番の `MapsService.get_loop_walking_route`（決定1）と同じく
`ThreadPoolExecutor` で並列に行う。1提示あたりの待ち時間は、この並列2呼び出し分の
経過時間として計測する（本番の待ち時間と同じ条件にするため、逐次実行はしない）。

出力:
    - 標準出力: 候補ごとの指標・合否・採用結果・呼び出し回数、末尾にサマリー
      （フォールバック率・detour_ratio の分布・1提示あたりの待ち時間）
    - `tmp-probe/<timestamp>.geojson`: 往路・復路・経由点。`.gitignore` 済みなので
      geojson.io 等にドラッグ＆ドロップして採用ルートを目視確認する
      （ひげ・川の対岸への大回り・私有地の突っ切りが無いかを見る）

実測結果（数値の表と、調整した定数と理由）は
`docs/adr/ADR-007-loop-route-generation.md` に転記すること（このスクリプトの出力や
`tmp-probe/` を将来の参照先にしない — `tmp/` 配下と同様、恒久的な参照先にしてはいけない）。
"""

import json
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
from pathlib import Path

import yaml

from sanposcape.config import get_settings
from sanposcape.integrations.google_maps.client import HttpGoogleMapsProvider
from sanposcape.integrations.google_maps.exceptions import (
    GoogleMapsQuotaError,
    GoogleMapsUnavailableError,
)
from sanposcape.integrations.google_maps.provider import (
    ProviderLoopRoute,
    ProviderPoint,
    ProviderRoute,
)
from sanposcape.maps.loop_route import (
    LoopCandidate,
    LoopEvaluation,
    evaluate_loop,
    loop_waypoint_candidates,
    select_loop,
)

_CASES_PATH = Path(__file__).resolve().parent / "loop_route_probe_cases.yaml"
_OUTPUT_DIR = Path(__file__).resolve().parent.parent / "tmp-probe"
_TIMEOUT_SECONDS = 15.0
# 本番の `MapsService._LOOP_CANDIDATE_WORKERS` と同じく、候補（右・左）は常に2つ。
_LOOP_CANDIDATE_WORKERS = 2


def main() -> None:
    settings = get_settings()
    if settings.maps_mode != "real":
        print(
            "MAPS_MODE=real で実行してください（.env の MAPS_MODE を外すか real にする）。",
            file=sys.stderr,
        )
        raise SystemExit(1)
    if not settings.google_maps_server_api_key:
        print(
            "GOOGLE_MAPS_SERVER_API_KEY が未設定です。.env に実キーを設定してください。",
            file=sys.stderr,
        )
        raise SystemExit(1)

    cases = yaml.safe_load(_CASES_PATH.read_text())["cases"]
    provider = HttpGoogleMapsProvider(settings)
    features: list[dict] = []
    fallback_count = 0
    detour_ratios: list[float] = []
    elapsed_seconds: list[float] = []

    try:
        for case in cases:
            label = case["label"]
            origin = ProviderPoint(**case["origin"])
            destination = ProviderPoint(**case["destination"])
            print(f"\n=== {label} ===")

            candidates = loop_waypoint_candidates(origin, destination)
            if not candidates:
                print("  O-D が近すぎるため周回を作らない（同じ道フォールバック相当）")
                continue

            call_count = len(candidates)
            started_at = time.monotonic()
            outcomes: dict[str, object] = {}
            with ThreadPoolExecutor(max_workers=_LOOP_CANDIDATE_WORKERS) as executor:
                future_to_candidate = {
                    executor.submit(
                        provider.get_walking_loop_route,
                        origin,
                        destination,
                        candidate.via,
                        timeout_seconds=_TIMEOUT_SECONDS,
                    ): candidate
                    for candidate in candidates
                }
                for future, candidate in future_to_candidate.items():
                    try:
                        outcomes[candidate.side] = future.result()
                    except (GoogleMapsQuotaError, GoogleMapsUnavailableError) as exc:
                        outcomes[candidate.side] = exc
            elapsed_seconds.append(time.monotonic() - started_at)

            evaluations: list[LoopEvaluation] = []
            for candidate in candidates:  # right -> left の順で表示する（本番の判定順と合わせる）
                outcome = outcomes[candidate.side]
                if isinstance(outcome, GoogleMapsQuotaError):
                    print(f"  [{candidate.side}] quota error")
                    continue
                if isinstance(outcome, GoogleMapsUnavailableError):
                    print(f"  [{candidate.side}] unavailable")
                    continue
                loop_route = outcome
                verdict = evaluate_loop(
                    loop_route.outbound, loop_route.inbound, candidate.via, origin, destination
                )
                evaluations.append(
                    LoopEvaluation(
                        side=candidate.side,
                        via=candidate.via,
                        outbound=loop_route.outbound,
                        inbound=loop_route.inbound,
                        verdict=verdict,
                    )
                )
                print(
                    f"  [{candidate.side}] accepted={verdict.accepted} reason={verdict.reason} "
                    f"detour={verdict.detour_ratio:.3f} overlap={verdict.return_overlap_ratio:.3f} "
                    f"backtrack={verdict.return_backtrack_ratio:.3f} "
                    f"snap={verdict.via_snap_distance_meters:.1f}m"
                )
                features.extend(_geojson_features(label, candidate, loop_route))

            selected = select_loop(tuple(evaluations))
            if selected is not None:
                print(f"  -> 採用: side={selected.side}（呼び出し{call_count}回）")
                detour_ratios.append(selected.verdict.detour_ratio)
            else:
                print(f"  -> フォールバック: 同じ道（呼び出し{call_count}回）")
                fallback_count += 1
    finally:
        provider.close()

    _print_summary(len(cases), fallback_count, detour_ratios, elapsed_seconds)
    _write_geojson(features)


def _print_summary(
    total_cases: int,
    fallback_count: int,
    detour_ratios: list[float],
    elapsed_seconds: list[float],
) -> None:
    print("\n=== サマリー ===")
    print(f"フォールバック率（同じ道): {fallback_count}/{total_cases}")
    if detour_ratios:
        ratios = sorted(detour_ratios)
        print(
            f"detour_ratio: median={_percentile(ratios, 50):.3f} "
            f"p90={_percentile(ratios, 90):.3f} max={max(ratios):.3f}"
        )
    if elapsed_seconds:
        seconds = sorted(elapsed_seconds)
        print(
            f"1提示あたりの待ち時間（左右並列2呼び出し): "
            f"p90={_percentile(seconds, 90):.2f}s max={max(seconds):.2f}s"
        )


def _percentile(sorted_values: list[float], percentile: float) -> float:
    if not sorted_values:
        return 0.0
    index = min(len(sorted_values) - 1, round((percentile / 100) * (len(sorted_values) - 1)))
    return sorted_values[index]


def _write_geojson(features: list[dict]) -> None:
    _OUTPUT_DIR.mkdir(exist_ok=True)
    output_path = _OUTPUT_DIR / f"{datetime.now(UTC):%Y%m%dT%H%M%SZ}.geojson"
    geojson = {"type": "FeatureCollection", "features": features}
    output_path.write_text(json.dumps(geojson, ensure_ascii=False, indent=2))
    print(f"\nGeoJSON を書き出しました: {output_path}")


def _geojson_features(
    label: str, candidate: LoopCandidate, loop_route: ProviderLoopRoute
) -> list[dict]:
    def line(route: ProviderRoute, kind: str) -> dict:
        return {
            "type": "Feature",
            "properties": {"label": label, "side": candidate.side, "kind": kind},
            "geometry": {
                "type": "LineString",
                "coordinates": [[point.longitude, point.latitude] for point in route.path],
            },
        }

    via_point = {
        "type": "Feature",
        "properties": {"label": label, "side": candidate.side, "kind": "via"},
        "geometry": {
            "type": "Point",
            "coordinates": [candidate.via.longitude, candidate.via.latitude],
        },
    }
    return [line(loop_route.outbound, "outbound"), line(loop_route.inbound, "inbound"), via_point]


if __name__ == "__main__":
    main()

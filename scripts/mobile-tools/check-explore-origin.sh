#!/usr/bin/env bash
# =============================================================================
# check-explore-origin.sh
#
# 指定した現在地で `POST /explore/places` が成功するかを、アプリを触らずに
# backend 側だけで先に確かめる。
#
# なぜ必要か:
#   Places が返した候補のうち1件でも徒歩ルートを引けないと（Routes が routes:[] を返すと）、
#   検索全体が 503 になる。しかもこの経路は client.py でログを出さずに例外を投げるため、
#   サーバーログには「503」しか残らず原因が分からない。
#   典型例は「駅の真上を現在地にする」ケースで、Places が現在地そのもの（例: 東京駅）を
#   候補に含め、出発地=目的地のルート計算が空になる。
#
# 使い方:
#   bash scripts/mobile-tools/check-explore-origin.sh 35.7050 139.7500
#   bash scripts/mobile-tools/check-explore-origin.sh          # 既定の検証済み地点を使う
#
# 終了コード: 0=その地点で検索が成功する / 1=失敗する候補がある
# =============================================================================
set -uo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/lib/common.sh"

# 既定は検証済みの地点（文京区・白山近辺）。駅やランドマークの真上を避けた住宅街。
lat="${1:-35.7050}"
lon="${2:-139.7500}"

dc ps --status running --services 2>/dev/null | grep -qx api ||
  die "backend の api コンテナが起動していません（bash scripts/mobile-tools/dev-up.sh）"

info "現在地 ${lat}, ${lon} で候補と徒歩ルートを検証します"

dc exec -T api uv run python - "$lat" "$lon" <<'PY' 2>&1 | grep -v '^INFO:httpx' || exit 1
import sys

from sanposcape.config import get_settings
from sanposcape.integrations.google_maps.client import build_google_maps_provider
from sanposcape.integrations.google_maps.provider import ProviderPoint
from sanposcape.maps.schemas import ExploreCategory

lat, lon = float(sys.argv[1]), float(sys.argv[2])
settings = get_settings()
provider = build_google_maps_provider(settings)
print(f"provider={type(provider).__name__} maps_mode={getattr(settings, 'maps_mode', '-')}")

origin = ProviderPoint(latitude=lat, longitude=lon)
categories = tuple(sorted(c.value for c in ExploreCategory))
places = provider.search_places(
    origin, categories, settings.google_maps_max_place_candidates, timeout_seconds=15.0
)
print(f"candidates={len(places)}")

failures = []
for place in places:
    try:
        route = provider.get_walking_route(origin, place.location, timeout_seconds=10.0)
        print(f"  OK   {place.name}  {route.distance_meters}m / {route.duration_seconds}s")
    except Exception as exc:  # noqa: BLE001 - 原因の型をそのまま見せたい
        failures.append(place.name)
        print(f"  FAIL {place.name}  {type(exc).__name__}")

if failures:
    print()
    print("この地点は POST /explore/places が 503 になります。")
    print("ルートを引けない候補: " + ", ".join(failures))
    print("駅やランドマークの真上を避けた地点を現在地にしてください。")
    sys.exit(1)

print()
print("この地点なら検索は成功します。")
PY

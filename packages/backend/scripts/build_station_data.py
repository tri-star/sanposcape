"""国土数値情報「鉄道データ」（N02）の駅から、最寄り駅の検索に使う CSV を作る（SS-225）。

出力は `src/sanposcape/maps/data/stations.csv`（`name,latitude,longitude`）。生成物はコミットし、
Lambda の成果物には `Makefile` の `cp -r src/sanposcape` で入る。

- 駅は路線ごとの線（LineString）で収録されているので、同じグループコード（`N02_005g`。
  300m 以内にある同じ名前の駅をまとめたもの）ごとに1行にまとめ、構成する座標の平均を位置にする。
- 2020年度以降の版は CC BY 4.0（出典の表示が要る）。mobile のライセンス画面に出典を載せている
  （`packages/mobile/src/features/settings/data/thirdPartyNotices.ts`）。版を上げたら、
  `maps/nearest_station.py` の `STATION_DATA_SOURCE` と、ライセンス画面の版の表記も
  合わせて更新する。

★ 標準ライブラリだけで書く（データの更新は年に1回程度で、ホストの python3 で流せればよい）。

使い方（packages/backend で実行）:
    curl -sSLO https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-24/N02-24_GML.zip
    unzip N02-24_GML.zip -d n02
    python3 scripts/build_station_data.py n02/UTF-8/N02-24_Station.geojson
"""

import argparse
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

DEFAULT_OUTPUT_PATH = (
    Path(__file__).resolve().parent.parent / "src" / "sanposcape" / "maps" / "data" / "stations.csv"
)

# 小数5桁 ≒ 1m。駅の位置（グループの重心）としてはこれで足りる。
_COORDINATE_DIGITS = 5


def build_rows(geojson: dict) -> list[tuple[str, float, float]]:
    """N02 の Station の GeoJSON を、グループごとの `(駅名, 緯度, 経度)` にまとめる。"""
    names: dict[str, str] = {}
    coordinates: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for feature in geojson["features"]:
        properties = feature["properties"]
        group = properties["N02_005g"]
        name = properties["N02_005"].strip()
        if not name:
            continue
        # グループは同じ名前の駅だけをまとめるので、名前はどの要素から取っても同じ。
        names.setdefault(group, name)
        for longitude, latitude in feature["geometry"]["coordinates"]:
            coordinates[group].append((latitude, longitude))

    rows = []
    for group, name in names.items():
        points = coordinates[group]
        latitude = round(sum(p[0] for p in points) / len(points), _COORDINATE_DIGITS)
        longitude = round(sum(p[1] for p in points) / len(points), _COORDINATE_DIGITS)
        rows.append((name, latitude, longitude))
    # 版を上げたときの差分を読みやすくするため、名前と位置で並べる。
    rows.sort()
    return rows


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("station_geojson", type=Path, help="N02-XX_Station.geojson（UTF-8 版）")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_PATH)
    args = parser.parse_args(argv)

    geojson = json.loads(args.station_geojson.read_text(encoding="utf-8"))
    rows = build_rows(geojson)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as file:
        writer = csv.writer(file, lineterminator="\n")
        writer.writerow(("name", "latitude", "longitude"))
        writer.writerows(rows)
    print(f"wrote {len(rows)} stations to {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))

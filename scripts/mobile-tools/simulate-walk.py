#!/usr/bin/env python3
"""エミュレータのGPSに歩行軌跡を流し込む。

`adb emu geo fix` を一定間隔で送り、出発地から目的地まで歩いて折り返す動きを再現する。
アプリ側は位置更新の積み上げで歩行距離を出すため、1点だけ動かしても距離は伸びない。

使い方:
    python3 scripts/mobile-tools/simulate-walk.py --from 35.7050,139.7500 --to 35.7057,139.7493
    python3 scripts/mobile-tools/simulate-walk.py --from ... --to ... --one-way --steps 20
    python3 scripts/mobile-tools/simulate-walk.py --from ... --to ... --dry-run

注意:
    `adb` は Windows の adb.exe ラッパー。Claude Code から実行する場合、
    excludedCommands の `adb *` に一致させるため、このスクリプト自体を
    サンドボックス外で実行すること（ループ内の adb 呼び出しは
    コマンド先頭が `python3` になるため除外設定に乗らない）。
"""

from __future__ import annotations

import argparse
import subprocess
import sys
import time


def parse_point(value: str) -> tuple[float, float]:
    try:
        lat_text, lon_text = value.split(",")
        return float(lat_text), float(lon_text)
    except ValueError as exc:
        raise argparse.ArgumentTypeError(
            f"緯度,経度 の形式で指定してください: {value!r}"
        ) from exc


def send_fix(lat: float, lon: float, *, dry_run: bool) -> None:
    # adb emu geo fix は「経度 緯度」の順。取り違えると地球の裏側へ飛ぶ。
    command = ["adb", "emu", "geo", "fix", f"{lon:.7f}", f"{lat:.7f}"]
    if dry_run:
        print(" ".join(command))
        return
    result = subprocess.run(command, capture_output=True, text=True)
    if result.returncode != 0:
        raise SystemExit(f"adb emu geo fix に失敗しました: {result.stderr.strip()}")


def leg(
    start: tuple[float, float],
    end: tuple[float, float],
    steps: int,
    jitter: float,
    *,
    skip_first: bool,
) -> list[tuple[float, float]]:
    """start から end までを steps 分割した座標列を返す。

    jitter は実機のGPSゆらぎの代わり。完全な直線だと軌跡が不自然になるうえ、
    往路と復路が同一座標になって距離が伸びないことがある。
    """
    points: list[tuple[float, float]] = []
    for i in range(0 if not skip_first else 1, steps + 1):
        t = i / steps
        offset = jitter if i % 2 else -jitter
        points.append(
            (
                start[0] + (end[0] - start[0]) * t + offset,
                start[1] + (end[1] - start[1]) * t + offset,
            )
        )
    return points


def main() -> int:
    parser = argparse.ArgumentParser(
        description=__doc__,
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "--from", dest="origin", type=parse_point, required=True, help="出発地 緯度,経度"
    )
    parser.add_argument(
        "--to", dest="destination", type=parse_point, required=True, help="目的地 緯度,経度"
    )
    parser.add_argument("--steps", type=int, default=12, help="片道の分割数 (既定: 12)")
    parser.add_argument(
        "--interval", type=float, default=2.0, help="1点あたりの送信間隔・秒 (既定: 2.0)"
    )
    parser.add_argument(
        "--jitter", type=float, default=0.00004, help="座標のゆらぎ・度 (既定: 0.00004 ≒ 4m)"
    )
    parser.add_argument("--one-way", action="store_true", help="折り返さず片道だけ歩く")
    parser.add_argument("--dwell", type=float, default=0.0, help="目的地での滞在秒数 (既定: 0)")
    parser.add_argument(
        "--dry-run", action="store_true", help="adb を呼ばずに送信予定の座標を表示する"
    )
    args = parser.parse_args()

    if args.steps < 1:
        parser.error("--steps は1以上を指定してください")

    points = leg(args.origin, args.destination, args.steps, args.jitter, skip_first=False)
    turnaround = len(points)
    if not args.one_way:
        points += leg(args.destination, args.origin, args.steps, args.jitter, skip_first=True)

    total = len(points)
    estimated = total * args.interval + args.dwell
    print(f"{total} 点を {args.interval} 秒間隔で送信します（所要 約{estimated:.0f}秒）")

    for index, (lat, lon) in enumerate(points, start=1):
        send_fix(lat, lon, dry_run=args.dry_run)
        print(f"  [{index}/{total}] lat={lat:.7f} lon={lon:.7f}", flush=True)
        if args.dry_run:
            continue
        if index == turnaround and args.dwell > 0:
            time.sleep(args.dwell)
        if index < total:
            time.sleep(args.interval)

    print("完了")
    return 0


if __name__ == "__main__":
    sys.exit(main())

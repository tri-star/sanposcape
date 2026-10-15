import { toNonNegative } from "@/lib/numberGuard";

/**
 * 平均時速（km/h、小数1桁に丸めた値）。距離0・時間0・非有限値のときは算出不能として null。
 *
 * 距離は表示用に小数1桁へ丸めた km（`toKilometers`）ではなく、生の `distanceMeters` を使う。
 * 丸め済みの km を使うと、丸め幅（最大50m）が計算全体に効いて時速が最大で数%ずれる
 * （例: 2143m/1920秒 → 生値なら約4.0km/h、2.1kmに丸めてから割ると約3.9km/h）。
 * 丸めはこの関数の戻り値の1箇所に留める。
 *
 * 遅い値の上限（旧ペース表示の「99分/km 超は算出不能」）は設けない。
 * 時速なら遅い値も桁が崩れず、ほぼ動かなかった記録としてそのまま正しいため（SS-65）。
 */
export function toAverageSpeedKmh(durationSeconds: number, distanceMeters: number): number | null {
  const hours = toNonNegative(durationSeconds) / 3600;
  const km = toNonNegative(distanceMeters) / 1000;

  if (hours <= 0 || km <= 0) {
    return null;
  }

  return Math.round((km / hours) * 10) / 10;
}

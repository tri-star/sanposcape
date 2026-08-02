import { toNonNegative } from "@/lib/numberGuard";
import { toKilometers } from "@/lib/units";

/** 距離0・時間0・非有限値・異常に遅い値のときに表示する代替文字列。 */
const PACE_UNAVAILABLE = "—";

/** これを超える分/kmは GPS が飛んだ記録とみなし「算出不能」扱いにする。 */
const MAX_MINUTES_PER_KM = 99;

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * 平均ペースを「12'30"/km」形式で表す。距離0・時間0・非有限値のときは「—」。
 */
export function formatPace(durationSeconds: number, distanceMeters: number): string {
  const durationSec = toNonNegative(durationSeconds);
  const km = toKilometers(distanceMeters);

  if (durationSec <= 0 || km <= 0) {
    return PACE_UNAVAILABLE;
  }

  const secPerKm = durationSec / km;
  if (secPerKm / 60 > MAX_MINUTES_PER_KM) {
    return PACE_UNAVAILABLE;
  }

  let minutes = Math.floor(secPerKm / 60);
  let seconds = Math.round(secPerKm % 60);
  if (seconds === 60) {
    seconds = 0;
    minutes += 1;
  }

  return `${minutes}'${pad2(seconds)}"/km`;
}

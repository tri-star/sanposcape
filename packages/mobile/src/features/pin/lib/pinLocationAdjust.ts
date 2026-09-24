import { isValidCoordinate } from "@/lib/geoCoordinate";
import type { PinSaveStatus } from "@/features/pin/types";
import type { GeoCoordinates } from "@/services/location/types";

/** 座標を送信時の丸め精度（1e-6 度）に丸める。`buildPinCreateRequest` と同じ精度。 */
function roundForCompare(value: number): number {
  return Math.round(value * 1e6);
}

/**
 * 2点が「同じ位置」か。`buildPinCreateRequest` が送信時に丸める精度（1e-6 度）で比べる
 * （`Math.round(v * 1e6)` 同士の一致）。丸めた後の値が同じなら、送られる値も同じになる。
 */
export function isSameCoordinate(a: GeoCoordinates, b: GeoCoordinates): boolean {
  return (
    roundForCompare(a.latitude) === roundForCompare(b.latitude) &&
    roundForCompare(a.longitude) === roundForCompare(b.longitude)
  );
}

/**
 * 調整オーバーレイで確定した位置を反映する。
 * - picked が不正なら null（呼び出し側は何もしない）
 * - 元の位置と同じなら isAdjusted: false（調整を取り消したのと同じ扱い。「調整済み」表示・
 *   破棄確認の対象から外れる）
 */
export function resolveAdjustedLocation(input: {
  original: GeoCoordinates;
  picked: GeoCoordinates;
}): { location: GeoCoordinates; isAdjusted: boolean } | null {
  if (!isValidCoordinate(input.picked)) {
    return null;
  }
  return {
    location: input.picked,
    isAdjusted: !isSameCoordinate(input.original, input.picked),
  };
}

/**
 * 「位置を調整」を押せるか（D9）。
 * - saving / saved は false
 * - savedPinId !== null（作成済み。写真の紐付けの途中で失敗した場合を含む）は false。
 *   client_pin_id の冪等な再送は内容を無視して既存のピンを返すため、位置を変えても反映されない
 * - それ以外（idle、作成前の error）は true
 */
export function canAdjustPinLocation(input: {
  saveStatus: PinSaveStatus;
  savedPinId: string | null;
}): boolean {
  if (input.saveStatus === "saving" || input.saveStatus === "saved") {
    return false;
  }
  if (input.savedPinId !== null) {
    return false;
  }
  return true;
}

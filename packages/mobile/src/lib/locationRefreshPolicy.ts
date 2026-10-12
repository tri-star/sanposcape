import type { LocationErrorCode } from "@/services/location/types";

/**
 * 現在地の静かな取り直し（`useCurrentLocation().refresh`）を省く猶予時間（ミリ秒）。
 * ピンタブはタブを行き来するたびにフォーカスを取り戻すが、そのたびに GPS を起動すると
 * バッテリーと待ち時間の無駄になる。散歩の最中でない徒歩の移動は 30 秒で数十 m 程度で、
 * ピンタブの地図（現在地マーカーと「現在地」ボタン）の用途では誤差なので、直近 30 秒以内に
 * 取得できた位置は使い回す。
 */
export const LOCATION_REFRESH_MIN_INTERVAL_MS = 30_000;

/**
 * 静かな取り直しを省くか（純粋）。直近の取得成功時刻が猶予時間内なら true。
 * 一度も取得できていない（null）、または時計が巻き戻っている（経過が負）ときは省かない。
 */
export function shouldSkipSilentRefresh(input: {
  lastFetchedAt: number | null;
  now: number;
  minIntervalMs?: number;
}): boolean {
  if (input.lastFetchedAt === null) return false;
  const elapsed = input.now - input.lastFetchedAt;
  if (elapsed < 0) return false;
  return elapsed < (input.minIntervalMs ?? LOCATION_REFRESH_MIN_INTERVAL_MS);
}

/**
 * アプリが前面に戻ったときに権限を確認し直すか（純粋）。
 * permission_denied の間だけ true（設定アプリで許可して戻ったときに回復させるため）。
 * 確認は getPermissionStatus（ダイアログを出さない）だけで行い、requestPermission は呼ばない
 * （前面復帰のたびに OS のダイアログを出し直すと、5.1.1(iv) の「繰り返し求める」になる）。
 */
export function shouldRecheckPermissionOnForeground(errorCode: LocationErrorCode | null): boolean {
  return errorCode === "permission_denied";
}

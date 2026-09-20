import type { AppStateStatus } from "react-native"; // ← 型のみ（import type はトランスパイルで消える）

/**
 * サーバーは `Cache-Control: no-store`（ADR-008 追補 D10）だが、これは
 * 「CloudFront / 中間キャッシュに持たせない」ための指定であって、
 * 起動中のアプリがメモリ上に値を保持してはいけないという意味ではない。
 * 画面遷移のたびに叩かないよう 5 分を鮮度とし、実際の更新検知はフォアグラウンド復帰で行う。
 * （AppConfig 側の反映遅延自体が「ベイク時間 + backend のポーリング間隔 60 秒」あるため、
 *   これより短くしても意味が無い。）
 */
export const APP_CONFIG_STALE_TIME_MS = 5 * 60_000;

/** フォアグラウンド復帰の再取得の最小間隔（アプリ切り替えの連打で叩き続けないため）。 */
export const APP_CONFIG_MIN_REFRESH_INTERVAL_MS = 60_000;

/**
 * 「バックグラウンド/非アクティブ → active」に変わり、かつ前回取得から
 * `minIntervalMs` 以上経っていれば true。`dataUpdatedAt === 0`（未取得）は常に true。
 */
export function shouldRefreshOnForeground(input: {
  previousState: AppStateStatus;
  nextState: AppStateStatus;
  /** `queryClient.getQueryState(key)?.dataUpdatedAt ?? 0` を渡す。 */
  dataUpdatedAt: number;
  nowMs: number;
  minIntervalMs?: number; // 既定 APP_CONFIG_MIN_REFRESH_INTERVAL_MS
}): boolean {
  const { previousState, nextState, dataUpdatedAt, nowMs } = input;
  const minIntervalMs = input.minIntervalMs ?? APP_CONFIG_MIN_REFRESH_INTERVAL_MS;

  if (nextState !== "active" || previousState === "active") {
    return false;
  }

  if (dataUpdatedAt === 0) {
    return true;
  }

  return nowMs - dataUpdatedAt >= minIntervalMs;
}

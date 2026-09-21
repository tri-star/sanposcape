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
 * 「バックグラウンド/非アクティブ → active」に変わり、かつ**最後に試行した時刻**
 * （`lastAttemptedAt = max(dataUpdatedAt, errorUpdatedAt)`）から `minIntervalMs` 以上
 * 経っていれば true。`lastAttemptedAt === 0`（一度も試していない）は常に true。
 *
 * `dataUpdatedAt` は TanStack Query の仕様上**成功時にしか更新されない**ため、これ単体では
 * 「取得が失敗し続けている間」を判定できない（初回失敗なら永久に 0、成功後の失敗なら古い
 * 成功時刻のまま前進しない）。そのため失敗時刻 `errorUpdatedAt` も見て、どちらか新しい方を
 * 「最後に試行した時刻」として扱う。また `isFetching`（実行中）なら、前回の試行（リトライ含む）
 * が終わっていないということなので、重ねて `invalidateQueries` しないよう false を返す。
 */
export function shouldRefreshOnForeground(input: {
  previousState: AppStateStatus;
  nextState: AppStateStatus;
  /** `queryClient.getQueryState(key)?.dataUpdatedAt ?? 0` を渡す。 */
  dataUpdatedAt: number;
  /** `queryClient.getQueryState(key)?.errorUpdatedAt ?? 0` を渡す。 */
  errorUpdatedAt: number;
  /** `queryClient.getQueryState(key)?.fetchStatus === "fetching"` を渡す。実行中なら重ねない。 */
  isFetching: boolean;
  nowMs: number;
  minIntervalMs?: number; // 既定 APP_CONFIG_MIN_REFRESH_INTERVAL_MS
}): boolean {
  const { previousState, nextState, dataUpdatedAt, errorUpdatedAt, isFetching, nowMs } = input;
  const minIntervalMs = input.minIntervalMs ?? APP_CONFIG_MIN_REFRESH_INTERVAL_MS;

  if (nextState !== "active" || previousState === "active") {
    return false;
  }

  if (isFetching) {
    return false;
  }

  const lastAttemptedAt = Math.max(dataUpdatedAt, errorUpdatedAt);

  if (lastAttemptedAt === 0) {
    return true;
  }

  return nowMs - lastAttemptedAt >= minIntervalMs;
}

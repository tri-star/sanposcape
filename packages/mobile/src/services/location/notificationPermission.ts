import { describeError, logDiagnostic } from "@/lib/diagnosticLog";

/** `POST_NOTIFICATIONS` が実行時権限になる Android の API レベル（Android 13）。 */
export const POST_NOTIFICATIONS_MIN_API_LEVEL = 33;

export type NotificationPermissionResult = "granted" | "denied" | "never_ask_again";

/** react-native の `Platform` / `PermissionsAndroid` を差し込む口（単体テストで差し替える）。 */
export type NotificationPermissionDeps = {
  /** `Platform.OS`。 */
  os: string;
  /** `Platform.Version`（Android は API レベルの数値）。 */
  version: number | string;
  /** すでに許可されているか（ダイアログを出さない）。 */
  check(): Promise<boolean>;
  /** OS のダイアログを出して結果を返す。 */
  request(): Promise<NotificationPermissionResult>;
};

/**
 * 散歩の背景記録を始めるときに、Android 13 以上で通知の実行時許可を求める関数を作る（ADR-M-018 決定15）。
 *
 * Android 13 以降は `POST_NOTIFICATIONS` が無いと、フォアグラウンドサービスの通知が通知シェードに出ない
 * （サービス自体は動く）。通知は「記録していること」をユーザーに伝える手段なので、許可を求める。
 *
 * - **拒否されても、失敗しても記録は始める**（この関数は throw しない。FGS は通知権限なしでも動く）。
 * - **1つの関数（= 1つの LocationService）につき最大1回しか求めない**。fallback からの再試行や
 *   次の散歩で、ダイアログが何度も出ないようにするため（拒否の結果は覚えておく）。
 * - iOS・Android 12 以下では何もしない。
 */
export function createNotificationPermissionRequester(
  deps: NotificationPermissionDeps,
): () => Promise<void> {
  let attempted = false;

  return async () => {
    if (attempted) return;
    if (deps.os !== "android") return;
    // 数値にならない（取れない）場合も、確実に求めてよいと言えないので何もしない。
    if (!(Number(deps.version) >= POST_NOTIFICATIONS_MIN_API_LEVEL)) return;
    // 先に立てる（ダイアログの表示中に再度呼ばれても、二重に出さない）。
    attempted = true;
    try {
      if (await deps.check()) return;
      const result = await deps.request();
      if (result !== "granted") {
        // 記録は続ける。通知が出ないだけ（原因調査用に残す）。
        logDiagnostic("walk_notification_permission_not_granted", { result });
      }
    } catch (error) {
      logDiagnostic("walk_notification_permission_request_failed", describeError(error));
    }
  };
}

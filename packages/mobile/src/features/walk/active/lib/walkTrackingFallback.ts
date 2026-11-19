import type { LocationErrorCode } from "@/services/location/types";

export type BackgroundTrackingFailureAction = "show_error" | "fallback_to_foreground";

/**
 * 背景記録を開始できなかったときの分岐。
 * - permission_denied / services_disabled: watchPosition でも失敗するので、従来どおりエラー表示
 *   （LocationPermissionNotice）にする
 * - それ以外（unavailable / timeout / unknown。古い dev build・FGS 権限欠落・背面からの開始など）:
 *   フォアグラウンドだけの記録（watchPosition）に切り替えて散歩を続ける
 */
export function resolveBackgroundTrackingFailure(
  code: LocationErrorCode,
): BackgroundTrackingFailureAction {
  switch (code) {
    case "permission_denied":
    case "services_disabled":
      return "show_error";
    case "timeout":
    case "unavailable":
    case "unknown":
      return "fallback_to_foreground";
  }
}

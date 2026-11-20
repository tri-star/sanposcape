import { isApiError } from "@/api/apiError";

export type ExploreErrorCode =
  | "unauthorized" // 401
  | "too_large" // 413
  | "invalid_request" // 422
  | "rate_limited" // 429
  | "provider_unavailable" // 503
  | "network"
  | "unknown";

/**
 * 任意の例外を ExploreErrorCode に分類する（純粋。`@/api/apiError` の `isApiError()` で status を見る。
 * `instanceof` は使わない — Hermes/トランスパイル環境で不安定になるため）。
 */
export function toExploreErrorCode(error: unknown): ExploreErrorCode {
  if (isApiError(error)) {
    switch (error.status) {
      case 401:
        return "unauthorized";
      case 413:
        return "too_large";
      case 422:
        return "invalid_request";
      case 429:
        return "rate_limited";
      case 503:
        return "provider_unavailable";
      default:
        return "unknown";
    }
  }

  if (error instanceof TypeError) {
    return "network";
  }

  return "unknown";
}

const MESSAGES: Record<ExploreErrorCode, string> = {
  unauthorized: "サインインすると、まわりのスポットを探せます。",
  too_large: "探索の条件を確認してください。",
  invalid_request: "探索の条件を確認してください。",
  rate_limited: "探索の回数が上限に達しました。しばらく時間をおいてからお試しください。",
  provider_unavailable: "地図サービスに接続できませんでした。時間をおいて再度お試しください。",
  network: "通信に失敗しました。電波状況を確認して再度お試しください。",
  unknown: "スポットの取得に失敗しました。もう一度お試しください。",
};

export function exploreErrorMessage(code: ExploreErrorCode): string {
  return MESSAGES[code];
}

const RETRIABLE_CODES = new Set<ExploreErrorCode>([
  "rate_limited",
  "provider_unavailable",
  "network",
  "unknown",
]);

/** ユーザーが手で再試行して意味があるか（再試行ボタンの出し分け）。 */
export function isRetriableExploreError(code: ExploreErrorCode): boolean {
  return RETRIABLE_CODES.has(code);
}

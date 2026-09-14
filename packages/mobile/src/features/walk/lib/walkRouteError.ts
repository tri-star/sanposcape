import type { ExploreErrorCode } from "@/features/walk/lib/exploreError";

/**
 * ルート取得失敗時の文言。分類は exploreError.ts の ExploreErrorCode を使う
 * （`/explore/*` は同じステータス集合を返すため、`toExploreErrorCode()` をそのまま再利用できる）。
 * 再試行可否は既存の `isRetriableExploreError()` をそのまま使う（重複定義しない）。
 */
const MESSAGES: Record<ExploreErrorCode, string> = {
  unauthorized: "サインインすると、ルートを表示できます。",
  too_large: "目的地の情報を取得できませんでした。別のスポットを選んでください。",
  invalid_request: "目的地の情報を取得できませんでした。別のスポットを選んでください。",
  rate_limited: "経路の取得回数が上限に達しました。しばらく時間をおいてからお試しください。",
  provider_unavailable: "地図サービスに接続できませんでした。時間をおいて再度お試しください。",
  network: "通信に失敗しました。電波状況を確認して再度お試しください。",
  unknown: "ルートの取得に失敗しました。もう一度お試しください。",
};

export function walkRouteErrorMessage(code: ExploreErrorCode): string {
  return MESSAGES[code];
}

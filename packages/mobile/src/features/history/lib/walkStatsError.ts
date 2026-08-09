import { isApiError } from "@/api/apiError";

/**
 * `GET /walks/stats` の失敗分類。`walkHistoryError.ts` は再利用しない —
 * `/walks/stats` はクエリパラメータもカーソルも持たないため 400 を返さない設計であり、
 * 誤って「一覧の読み込み位置が古くなりました」という無関係な文言が出るのを防ぐため、
 * コード体系ごと分ける（`walkSaveError.ts` / `walkHistoryError.ts` と同じ方針）。
 */
export type WalkStatsErrorCode =
  | "unauthorized" // 401
  | "invalid_request" // 422
  | "network" // TypeError（fetch 失敗）
  | "server" // 5xx
  | "unknown";

/**
 * 任意の例外を WalkStatsErrorCode に分類する（純粋。`isApiError()` で status を見る。
 * `instanceof` は使わない — Hermes/トランスパイル環境で不安定になるため。
 * ただし fetch の通信失敗を表す TypeError の分類だけは `instanceof` を使用する。
 */
export function toWalkStatsErrorCode(error: unknown): WalkStatsErrorCode {
  if (isApiError(error)) {
    if (error.status >= 500) {
      return "server";
    }
    switch (error.status) {
      case 401:
        return "unauthorized";
      case 422:
        return "invalid_request";
      default:
        return "unknown";
    }
  }

  if (error instanceof TypeError) {
    return "network";
  }

  return "unknown";
}

const MESSAGES: Record<WalkStatsErrorCode, string> = {
  unauthorized: "サインインし直すと、記録の集計を表示できます。",
  invalid_request: "記録の集計を取得できませんでした。",
  network: "通信に失敗しました。電波状況を確認して再試行してください。",
  server: "サーバーで問題が発生しました。時間をおいて再試行してください。",
  unknown: "記録の集計の取得に失敗しました。もう一度お試しください。",
};

export function walkStatsErrorMessage(code: WalkStatsErrorCode): string {
  return MESSAGES[code];
}

const RETRIABLE_CODES = new Set<WalkStatsErrorCode>(["network", "server", "unknown"]);

/** ユーザーが手で再試行して意味があるか。 */
export function isRetriableWalkStatsError(code: WalkStatsErrorCode): boolean {
  return RETRIABLE_CODES.has(code);
}

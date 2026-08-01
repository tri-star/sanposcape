import { isApiError } from "@/api/apiError";

/**
 * 保存失敗の分類。`exploreError.ts` は再利用しない
 * — `/walks` は 429/503 を返さず、逆に 500 系・413 の意味が違うため
 * （`walkRouteError.ts` が文言だけ差し替えたのと異なり、コード体系ごと分ける）。
 */
export type WalkSaveErrorCode =
  | "unauthorized" // 401（customFetch の refresh 後もダメだった）
  | "too_large" // 413（本文 1MiB 超）
  | "invalid_request" // 422 / buildWalkCreateRequest が null
  | "network" // TypeError（fetch 失敗）
  | "server" // 5xx
  | "unknown";

/**
 * 任意の例外を WalkSaveErrorCode に分類する（純粋。`isApiError()` で status を見る。
 * `instanceof` は使わない — Hermes/トランスパイル環境で不安定になるため）。
 */
export function toWalkSaveErrorCode(error: unknown): WalkSaveErrorCode {
  if (isApiError(error)) {
    if (error.status >= 500) {
      return "server";
    }
    switch (error.status) {
      case 401:
        return "unauthorized";
      case 413:
        return "too_large";
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

const MESSAGES: Record<WalkSaveErrorCode, string> = {
  unauthorized: "サインインし直すと、記録を保存できます。",
  too_large: "記録が大きすぎて保存できませんでした。",
  invalid_request: "この散歩は記録できませんでした。",
  network: "通信に失敗しました。電波状況を確認して再試行してください。",
  server: "サーバーで問題が発生しました。時間をおいて再試行してください。",
  unknown: "記録の保存に失敗しました。もう一度お試しください。",
};

export function walkSaveErrorMessage(code: WalkSaveErrorCode): string {
  return MESSAGES[code];
}

const RETRIABLE_CODES = new Set<WalkSaveErrorCode>(["network", "server", "unknown"]);

/** ユーザーが手で再試行して意味があるか（＝再試行ボタンを出すか）。 */
export function isRetriableWalkSaveError(code: WalkSaveErrorCode): boolean {
  return RETRIABLE_CODES.has(code);
}

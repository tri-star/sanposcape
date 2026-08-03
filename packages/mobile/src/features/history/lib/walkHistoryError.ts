import { isApiError } from "@/api/apiError";

/**
 * `/walks` の GET 系（一覧・詳細）の失敗分類。`exploreError.ts` / `walkSaveError.ts` は再利用しない
 * — `/walks` GET は 429/503 を返さず、代わりに 400（Invalid cursor）と 404（一覧には無い）がある
 * ため、コード体系ごと分ける（`walkSaveError.ts` と同じ方針）。
 */
export type WalkHistoryErrorCode =
  | "unauthorized" // 401
  | "not_found" // 404（詳細のみ。他ユーザー・存在しない id）
  | "invalid_cursor" // 400（一覧のみ）
  | "invalid_request" // 422
  | "network" // TypeError（fetch 失敗）
  | "server" // 5xx
  | "unknown";

/**
 * 任意の例外を WalkHistoryErrorCode に分類する（純粋。`isApiError()` で status を見る。
 * `instanceof` は使わない — Hermes/トランスパイル環境で不安定になるため。
 * ただし fetch の通信失敗を表す TypeError の分類だけは `instanceof` を使用する。
 */
export function toWalkHistoryErrorCode(error: unknown): WalkHistoryErrorCode {
  if (isApiError(error)) {
    if (error.status >= 500) {
      return "server";
    }
    switch (error.status) {
      case 400:
        return "invalid_cursor";
      case 401:
        return "unauthorized";
      case 404:
        return "not_found";
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

const MESSAGES: Record<WalkHistoryErrorCode, string> = {
  unauthorized: "サインインし直すと、散歩の記録を表示できます。",
  not_found: "この散歩の記録は見つかりませんでした。",
  invalid_cursor: "一覧の読み込み位置が古くなりました。再読み込みしてください。",
  invalid_request: "記録を取得できませんでした。",
  network: "通信に失敗しました。電波状況を確認して再試行してください。",
  server: "サーバーで問題が発生しました。時間をおいて再試行してください。",
  unknown: "記録の取得に失敗しました。もう一度お試しください。",
};

export function walkHistoryErrorMessage(code: WalkHistoryErrorCode): string {
  return MESSAGES[code];
}

/**
 * `invalid_cursor` も再試行可能に含める。ただし普通の再試行（同じカーソルでの refetch）では
 * 復旧しないため、UI 側は「先頭から読み直す」（`reload()` = `resetQueries`）に接続すること
 * （`useWalkHistory` を参照）。
 */
const RETRIABLE_CODES = new Set<WalkHistoryErrorCode>([
  "network",
  "server",
  "unknown",
  "invalid_cursor",
]);

/** ユーザーが手で再試行して意味があるか。 */
export function isRetriableWalkHistoryError(code: WalkHistoryErrorCode): boolean {
  return RETRIABLE_CODES.has(code);
}

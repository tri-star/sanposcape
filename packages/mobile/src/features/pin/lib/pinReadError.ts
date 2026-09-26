import { isApiError } from "@/api/apiError";

/**
 * ピン閲覧 GET 系（`GET /pins` / `GET /pins/{id}` / `GET /pins/{id}/photos`）の失敗分類。
 * `features/history/lib/walkHistoryError.ts` と同じ形だが、feature 間 import を避けるため
 * pin 側に持つ（`docs/architecture-guideline.md`）。
 */
export type PinReadErrorCode =
  | "unauthorized" // 401
  | "not_found" // 404
  | "invalid_cursor" // 400（写真ページのみ）
  | "invalid_request" // 422
  | "network" // TypeError（fetch 失敗）
  | "server" // 5xx
  | "unknown";

/**
 * 任意の例外を `PinReadErrorCode` に分類する（純粋。`isApiError()` で status を見る。
 * `instanceof` は使わない — Hermes/トランスパイル環境で不安定になるため。
 * ただし fetch の通信失敗を表す TypeError の分類だけは `instanceof` を使用する。
 */
export function toPinReadErrorCode(error: unknown): PinReadErrorCode {
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

const MESSAGES: Record<PinReadErrorCode, string> = {
  unauthorized: "サインインし直すと、ピンを表示できます。",
  not_found: "このピンは見つかりませんでした。削除された可能性があります。",
  invalid_cursor: "写真の読み込み位置が古くなりました。もう一度お試しください。",
  invalid_request: "ピンを取得できませんでした。",
  network: "通信に失敗しました。電波状況を確認して再試行してください。",
  server: "サーバーで問題が発生しました。時間をおいて再試行してください。",
  unknown: "ピンの取得に失敗しました。もう一度お試しください。",
};

export function pinReadErrorMessage(code: PinReadErrorCode): string {
  return MESSAGES[code];
}

const RETRIABLE_CODES = new Set<PinReadErrorCode>([
  "network",
  "server",
  "unknown",
  "invalid_cursor",
]);

/** ユーザーが手で再試行して意味があるか。 */
export function isRetriablePinReadError(code: PinReadErrorCode): boolean {
  return RETRIABLE_CODES.has(code);
}

import { isApiError } from "@/api/apiError";

/**
 * `DELETE /pins/{pin_id}` の失敗分類と削除ダイアログの文言（`walkDeleteError.ts` と
 * `walkDeleteCopy.ts` を1つにまとめた形）。
 *
 * 404 はここに来ない（`deletePin()` が成功に読み替え済み。ADR-009 決定21）。来た場合は
 * `unknown` に落ちる。文言を `.tsx` に書かずここに置くのは、コンポーネントのレンダリング
 * テストが書けない構成のため（`docs/architecture-guideline.md`）。
 */
export type PinDeleteErrorCode =
  | "unauthorized" // 401
  | "forbidden" // 403（作成者でない editor。通常は導線を出さないので防御）
  | "invalid_request" // 413 / 422（非 UUID の多層防御を含む）
  | "network" // TypeError
  | "server" // 5xx
  | "unknown";

export function toPinDeleteErrorCode(error: unknown): PinDeleteErrorCode {
  if (isApiError(error)) {
    if (error.status >= 500) return "server";
    switch (error.status) {
      case 401:
        return "unauthorized";
      case 403:
        return "forbidden";
      case 413:
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

const MESSAGES: Record<PinDeleteErrorCode, string> = {
  unauthorized: "サインインし直すと、ピンを削除できます。",
  forbidden: "このピンを削除する権限がありません。",
  invalid_request: "このピンは削除できませんでした。",
  network: "通信に失敗しました。電波状況を確認して再試行してください。",
  server: "サーバーで問題が発生しました。時間をおいて再試行してください。",
  unknown: "ピンの削除に失敗しました。もう一度お試しください。",
};

export function pinDeleteErrorMessage(code: PinDeleteErrorCode): string {
  return MESSAGES[code];
}

const RETRIABLE_CODES = new Set<PinDeleteErrorCode>(["network", "server", "unknown"]);

/**
 * 削除ダイアログに「削除する」ボタンを出してよいか。null（まだ失敗していない）なら出す。
 * 失敗後は再試行して意味がある場合だけ出す（401 / 403 / 422 は何度押しても同じ）。
 */
export function canRetryPinDelete(errorCode: PinDeleteErrorCode | null): boolean {
  return errorCode === null || RETRIABLE_CODES.has(errorCode);
}

export const PIN_DELETE_DIALOG_TITLE = "このピンを削除しますか？";
export const PIN_DELETE_DIALOG_DESCRIPTION = "写真・タグ・メモもすべて削除され、元に戻せません。";
export const PIN_DELETE_CANCEL_LABEL = "キャンセル";
/** 再試行できない失敗のとき、キャンセルの代わりに出す。 */
export const PIN_DELETE_CLOSE_LABEL = "閉じる";
export const PIN_DELETE_DONE_TITLE = "ピンを削除しました";

export function pinDeleteConfirmLabel(isDeleting: boolean): string {
  return isDeleting ? "削除しています…" : "削除する";
}

import { isApiError } from "@/api/apiError";

/**
 * `DELETE /walks/{walk_id}` の失敗分類。`walkHistoryError.ts`（GET 系）は再利用しない
 * —— DELETE では 404 がエラーではなく成功（`walkDeleteApi.ts` の `deleteWalk` が読み替え済み）、
 * 422 は入力不正（`walkHistoryError.ts` の `invalid_cursor` 相当は存在しない）と意味体系が違うため
 * （`walkSaveError.ts` / `walkHistoryError.ts` が体系ごと分けているのと同じ判断）。
 *
 * 404 はここに来ない（`deleteWalk()` で成功に読み替え済み）。それでも来た場合は
 * `default` の `unknown` に落ちる（分岐を足さない）。
 */
export type WalkDeleteErrorCode =
  | "unauthorized" // 401（customFetch の refresh 後もダメだった）
  | "invalid_request" // 422（および非 UUID の多層防御）
  | "network" // TypeError（fetch 失敗）
  | "server" // 5xx
  | "unknown"; // それ以外（413 等。DELETE は本文を持たないため実質到達しない）

/**
 * 任意の例外を WalkDeleteErrorCode に分類する（純粋。`isApiError()` で status を見る。
 * `instanceof` は使わない —— Hermes/トランスパイル環境で不安定になるため。
 * ただし fetch の通信失敗を表す TypeError の分類だけは `instanceof` を使用する。
 */
export function toWalkDeleteErrorCode(error: unknown): WalkDeleteErrorCode {
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

const MESSAGES: Record<WalkDeleteErrorCode, string> = {
  unauthorized: "サインインし直すと、記録を削除できます。",
  invalid_request: "この記録は削除できませんでした。",
  network: "通信に失敗しました。電波状況を確認して再試行してください。",
  server: "サーバーで問題が発生しました。時間をおいて再試行してください。",
  unknown: "記録の削除に失敗しました。もう一度お試しください。",
};

export function walkDeleteErrorMessage(code: WalkDeleteErrorCode): string {
  return MESSAGES[code];
}

const RETRIABLE_CODES = new Set<WalkDeleteErrorCode>(["network", "server", "unknown"]);

/** ユーザーが手で再試行して意味があるか（＝再試行ボタンを出すか）。 */
export function isRetriableWalkDeleteError(code: WalkDeleteErrorCode): boolean {
  return RETRIABLE_CODES.has(code);
}

/**
 * 削除ダイアログに「削除する」ボタンを出してよいか。
 *
 * `errorCode` が null（まだ失敗していない = 初回の確認中・実行中）なら当然出す。
 * 失敗後は再試行して意味がある場合だけ出す —— 401 / 422 は何度押しても同じ失敗を繰り返すため、
 * ボタンを残すと「あと1回押せば消えるかもしれない」と誤解させる。
 *
 * 判定を `.tsx` に書かずここに置くのは、この repo の Vitest 構成では
 * コンポーネントのレンダリングテストが書けないため（`docs/architecture-guideline.md`）。
 */
export function canRetryWalkDelete(errorCode: WalkDeleteErrorCode | null): boolean {
  return errorCode === null || isRetriableWalkDeleteError(errorCode);
}

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
 * ApiError の判定では `instanceof` を使わない — Hermes/トランスパイル環境で不安定になるため。
 * ただし fetch の通信失敗を表す TypeError の分類だけは `instanceof` を使用する。
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
  unauthorized: "サインインすると、この散歩の記録を保存できます。",
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

/**
 * ユーザーが手で再試行して意味があるか（＝再試行ボタンを出すか）。
 * `useWalkSave` の TanStack Query `retry` 述語（自動リトライ可否）でのみ使う。
 * UI が「何を提示するか」の判断には `walkSaveErrorAction` を使うこと（SS-37）。
 * unauthorized はここでは false のまま（再試行しても 401 のままなので自動リトライはしない）。
 */
export function isRetriableWalkSaveError(code: WalkSaveErrorCode): boolean {
  return RETRIABLE_CODES.has(code);
}

/** エラー表示に添えるユーザー操作。UI の分岐をここに集約する（SS-37）。 */
export type WalkSaveErrorAction = "retry" | "sign_in" | "none";

const ERROR_ACTIONS: Record<WalkSaveErrorCode, WalkSaveErrorAction> = {
  unauthorized: "sign_in", // 401: 再試行しても同じ。サインインが唯一の前進手段（SS-37）
  too_large: "none",
  invalid_request: "none",
  network: "retry",
  server: "retry",
  unknown: "retry",
};

/**
 * 保存失敗時に UI が出すべき操作を返す（純粋）。
 * `isRetriableWalkSaveError` は「自動リトライしてよいか」（`useWalkSave` の `retry` 述語）で、
 * こちらは「ユーザーに何を提示するか」。unauthorized だけが両者で食い違う（SS-37）。
 */
export function walkSaveErrorAction(code: WalkSaveErrorCode): WalkSaveErrorAction {
  return ERROR_ACTIONS[code];
}

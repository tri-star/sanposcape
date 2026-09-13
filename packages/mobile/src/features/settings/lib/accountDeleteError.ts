import { isApiError } from "@/api/apiError";

/**
 * `DELETE /users/me` の失敗分類。`walkDeleteError.ts` の `WalkDeleteErrorCode` と似ているが、
 * 別の型として持つ（feature 境界をまたいで型を共有しない）。
 *
 * `walkDeleteError.ts` の `invalid_request`（422）は持たない。アカウント削除はパスパラメータも
 * ボディも持たないため 422 は発生しない（来た場合は `unknown` に落ちる）。
 */
export type AccountDeleteErrorCode =
  | "unauthorized" // 401（customFetch の refresh 後もダメだった＝セッションが既に無効）
  | "network" // TypeError（fetch 失敗）
  | "server" // 5xx
  | "unknown"; // それ以外

/**
 * 任意の例外を AccountDeleteErrorCode に分類する（純粋。`isApiError()` で status を見る。
 * `instanceof` は使わない —— Hermes/トランスパイル環境で不安定になるため。
 * ただし fetch の通信失敗を表す TypeError の分類だけは `instanceof` を使用する。
 */
export function toAccountDeleteErrorCode(error: unknown): AccountDeleteErrorCode {
  if (isApiError(error)) {
    if (error.status >= 500) {
      return "server";
    }
    if (error.status === 401) {
      return "unauthorized";
    }
    return "unknown";
  }

  if (error instanceof TypeError) {
    return "network";
  }

  return "unknown";
}

const MESSAGES: Record<AccountDeleteErrorCode, string> = {
  unauthorized: "サインインの有効期限が切れました。もう一度サインインしてからやり直してください。",
  network: "通信に失敗しました。電波状況を確認して再試行してください。",
  server: "サーバーで問題が発生しました。時間をおいて再試行してください。",
  unknown: "アカウントの削除に失敗しました。もう一度お試しください。",
};

export function accountDeleteErrorMessage(code: AccountDeleteErrorCode): string {
  return MESSAGES[code];
}

const RETRIABLE_CODES = new Set<AccountDeleteErrorCode>(["network", "server", "unknown"]);

/** ユーザーが手で再試行して意味があるか（＝再試行ボタンを出すか）。 */
export function isRetriableAccountDeleteError(code: AccountDeleteErrorCode): boolean {
  return RETRIABLE_CODES.has(code);
}

/**
 * 削除ダイアログに「削除する」ボタンを出してよいか。
 *
 * `errorCode` が null（まだ失敗していない = 初回の確認中・実行中）なら当然出す。
 * 失敗後は再試行して意味がある場合だけ出す。
 *
 * **401 を非再試行にする理由（「ローカルを掃除して成功扱いにする」ことはしない）**:
 * 1. 401 は「アカウントが削除できていない」状態である。アカウントは backend に残っているのに
 *    「削除しました」と見せるのは、受け入れ条件（削除後は未認証状態に戻り、再サインインで
 *    新規ユーザーになる）と矛盾する嘘の表示になる。
 * 2. 受け入れ条件の「端末に前ユーザーのデータが残らない」は削除成功時の要件。しかも現実的な
 *    401 経路（refresh token 失効＝セッション失効）では、`customFetch` が refresh を試して
 *    401 を受けた時点で `createSessionAuthService.doRefresh()` が `tokenStore.clear()` +
 *    `setCurrentUser(null)` を実行するため、mobile 側が何もしなくても
 *    「トークン破棄 → runSessionCleanup() → authenticated → guest → AuthGate がサインイン
 *    画面へ退避」まで自動的に走る。端末にデータは残らない。
 * 3. もう一つの 401 経路（トークン非保持＝ゲスト）は、そもそも削除導線を出さないので発生しない
 *    （`canDeleteAccount`）。
 * 4. `features/settings` から `useAuthSessionStore.setSession(null)` を直接呼んで無理に
 *    ローカルを掃除する案は、ADR-009 決定2（ストアへの書き込み経路は `services/auth` の
 *    `onSessionChange` と `useAuthSessionBootstrap` の2つだけ）を破るため採らない。
 *
 * 判定を `.tsx` に書かずここに置くのは、この repo の Vitest 構成では
 * コンポーネントのレンダリングテストが書けないため（`docs/architecture-guideline.md`）。
 */
export function canRetryAccountDelete(errorCode: AccountDeleteErrorCode | null): boolean {
  return errorCode === null || isRetriableAccountDeleteError(errorCode);
}

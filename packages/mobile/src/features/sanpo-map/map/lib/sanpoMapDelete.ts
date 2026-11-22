import { isApiError } from "@/api/apiError";

/**
 * 地図の削除（`DELETE /sanpo-maps/{id}`。SS-265）の失敗分類と、確認ダイアログ・完了の文言。
 * `pinDeleteError.ts` と同じ構成。文言を `.tsx` に書かずここに置くのは、コンポーネントの
 * レンダリングテストが書けない構成のため（`docs/architecture-guideline.md`）。
 *
 * 404 はここに来ない（`deleteSanpoMap()` が成功に読み替え済み）。来た場合は `unknown` に落ちる。
 */
/** 削除の進み具合（`useSanpoMapDelete` が返し、確認ダイアログ・地図詳細が見る）。 */
export type SanpoMapDeleteStatus = "idle" | "deleting" | "error" | "deleted";

export type SanpoMapDeleteErrorCode =
  | "unauthorized" // 401
  | "forbidden" // 403（owner でなくなった。導線は owner にしか出さないので防御）
  | "invalid_request" // 413 / 422（非 UUID の多層防御を含む）
  | "network" // TypeError
  | "server" // 5xx
  | "unknown";

export function toSanpoMapDeleteErrorCode(error: unknown): SanpoMapDeleteErrorCode {
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

const MESSAGES: Record<SanpoMapDeleteErrorCode, string> = {
  unauthorized: "サインインし直すと、地図を削除できます。",
  forbidden: "この地図を削除する権限がありません。",
  invalid_request: "この地図は削除できませんでした。",
  network: "通信に失敗しました。電波状況を確認して再試行してください。",
  server: "サーバーで問題が発生しました。時間をおいて再試行してください。",
  unknown: "地図の削除に失敗しました。もう一度お試しください。",
};

export function sanpoMapDeleteErrorMessage(code: SanpoMapDeleteErrorCode): string {
  return MESSAGES[code];
}

const RETRIABLE_CODES = new Set<SanpoMapDeleteErrorCode>(["network", "server", "unknown"]);

/**
 * 確認ダイアログに「削除する」ボタンを出してよいか。null（まだ失敗していない）なら出す。
 * 失敗後は再試行して意味がある場合だけ出す（401 / 403 / 422 は何度押しても同じ）。
 * 再試行は安全（サーバーが消し終えていれば 404 になり、`deleteSanpoMap()` が成功として扱う）。
 */
export function canRetrySanpoMapDelete(errorCode: SanpoMapDeleteErrorCode | null): boolean {
  return errorCode === null || RETRIABLE_CODES.has(errorCode);
}

export const SANPO_MAP_DELETE_DIALOG_TITLE = "この地図を削除しますか？";
export const SANPO_MAP_DELETE_CANCEL_LABEL = "キャンセル";
/** 再試行できない失敗のとき、キャンセルの代わりに出す。 */
export const SANPO_MAP_DELETE_CLOSE_LABEL = "閉じる";
/** 地図詳細のヘッダーのボタンの読み上げ。 */
export const SANPO_MAP_DELETE_BUTTON_LABEL = "この地図を削除";

export function sanpoMapDeleteConfirmLabel(isDeleting: boolean): string {
  return isDeleting ? "削除しています…" : "削除する";
}

/**
 * 確認ダイアログの説明文（段落ごとの配列）。何が消えるかと、ほかのメンバーへの影響を書く。
 *
 * - `pinCount`: 地図詳細に出している件数（`resolveSanpoMapPinCount`。1000 件で打ち切ったときも一覧の
 *   `pin_count` の正確な件数）。null は不明。
 * - `otherMemberCount`: 自分以外のメンバーの人数。null は不明（読み込み中・失敗）。不明なら、メンバーがいる場合の扱いを
 *   条件付きで書く。
 * 招待のリンクが使えなくなることも書く。
 */
export function sanpoMapDeleteDescription(input: {
  pinCount: number | null;
  otherMemberCount: number | null;
}): string[] {
  const paragraphs: string[] = [];
  if (input.pinCount === null) {
    paragraphs.push("この地図のピンと、その写真・タグもすべて削除され、元に戻せません。");
  } else if (input.pinCount === 0) {
    paragraphs.push("この操作は元に戻せません。");
  } else {
    paragraphs.push(
      `この地図のピン${input.pinCount}件と、その写真・タグもすべて削除され、元に戻せません。`,
    );
  }

  if (input.otherMemberCount !== null && input.otherMemberCount > 0) {
    paragraphs.push(
      `ほかのメンバー${input.otherMemberCount}人もこの地図を見られなくなり、メンバーが追加したピン・写真も削除されます。`,
    );
  } else if (input.otherMemberCount === null) {
    paragraphs.push(
      "メンバーがいる場合は、メンバーもこの地図を見られなくなり、メンバーが追加したピン・写真も削除されます。",
    );
  }
  // 招待はメンバーがまだいなくても残っていることがある（地図の削除で消える。ADR-009 決定39）。
  paragraphs.push("この地図の招待のリンクも使えなくなります。");
  return paragraphs;
}

/** 削除の後に戻る地図一覧で出すトースト。 */
export function sanpoMapDeletedMessage(sanpoMapName: string): string {
  return sanpoMapName === "" ? "地図を削除しました" : `「${sanpoMapName}」を削除しました`;
}

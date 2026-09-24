/**
 * アカウント削除確認ダイアログ・危険ゾーンの文言を定数化する。「取り消し不能であることを
 * 伝える」ことを Vitest で機械的に検証できるようにするため、文言だけをこの純粋な `lib` に出す
 * （`.tsx` は Vitest 対象外。先例: `features/history/lib/walkDeleteCopy.ts`）。
 */

/** 設定画面の危険ゾーンの見出し。 */
export const ACCOUNT_DELETE_SECTION_TITLE = "アカウントの削除";

/** 危険ゾーンの説明。何が消えるかを具体的に書く。 */
export const ACCOUNT_DELETE_SECTION_DESCRIPTION =
  "アカウントと、これまでの散歩の記録（時間・距離・軌跡）をすべて削除します。削除すると元に戻せません。";

/** 危険ゾーンのボタン。ログアウトと取り違えないよう「アカウント」を明示する。 */
export const ACCOUNT_DELETE_BUTTON_LABEL = "アカウントを削除";

/** 確認ダイアログのタイトル。 */
export const ACCOUNT_DELETE_DIALOG_TITLE = "アカウントを削除しますか？";

/** 確認ダイアログ本文。取り消し不能・再サインインで新規ユーザーになることを明示する。 */
export const ACCOUNT_DELETE_DIALOG_DESCRIPTION =
  "アカウントと、これまでの散歩の記録（時間・距離・軌跡）をすべて削除します。削除すると元に戻せません。同じアカウントでサインインし直しても、以前の記録は復元できません。";

export const ACCOUNT_DELETE_CANCEL_LABEL = "キャンセル";

/** 再試行しても意味が無い失敗（401）のとき、キャンセルの代わりに出すラベル。 */
export const ACCOUNT_DELETE_CLOSE_LABEL = "閉じる";

/** 実行ボタンのラベル。実行中は押せないことが分かる文言にする。 */
export function accountDeleteConfirmLabel(isDeleting: boolean): string {
  return isDeleting ? "削除中..." : "削除する";
}

/**
 * 削除確認ダイアログの文言を定数化する。「取り消し不能であることを伝える」（受け入れ条件2）を
 * Vitest で機械的に検証できるようにするため、文言だけをこの純粋な `lib` に出す
 * （`.tsx` は Vitest 対象外。先例: `lib/walkHistoryEmptyState.ts`）。
 */

/** 確認ダイアログのタイトル。 */
export const WALK_DELETE_DIALOG_TITLE = "この散歩の記録を削除しますか？";

/** 本文。取り消せないことを明示する（ADR-003 決定13: 物理削除で復元手段が無い）。 */
export const WALK_DELETE_DIALOG_DESCRIPTION =
  "削除すると、この散歩の記録（時間・距離・軌跡）は元に戻せません。";

/** キャンセルボタンのラベル。 */
export const WALK_DELETE_CANCEL_LABEL = "キャンセル";

/**
 * 再試行しても意味が無い失敗（401 / 422）のときに、キャンセルの代わりに出すラベル。
 * この状態では削除ボタン自体を出さないため、「キャンセル」だと
 * 「削除を取りやめる」のか「閉じる」のかが曖昧になる（もう削除は実行できない）。
 */
export const WALK_DELETE_CLOSE_LABEL = "閉じる";

/** 削除ボタンのラベル。実行中は押せないことが分かる文言にする。 */
export function walkDeleteConfirmLabel(isDeleting: boolean): string {
  return isDeleting ? "削除中..." : "削除する";
}

/** 削除完了時に詳細画面へ一瞬出す文言（一覧へ遷移するまでの表示）。 */
export const WALK_DELETE_DONE_TITLE = "散歩の記録を削除しました";

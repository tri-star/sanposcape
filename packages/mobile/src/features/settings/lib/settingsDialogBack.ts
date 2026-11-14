/**
 * 設定画面で「戻る」が押されたとき、開いているダイアログをどう扱うか。
 * - `none`: ダイアログは開いていない。画面ごと戻る。
 * - `close-logout` / `close-account-delete`: そのダイアログだけを閉じ、画面は戻らない。
 * - `consume`: ログアウト中・削除中のため閉じず、戻る操作だけを消費する（`Dialog` の `dismissDisabled` と同じ扱い）。
 */
export type SettingsDialogBackAction = "none" | "close-logout" | "close-account-delete" | "consume";

export type SettingsDialogBackInput = {
  logoutDialogOpen: boolean;
  isSigningOut: boolean;
  accountDeleteDialogOpen: boolean;
  /** `isAccountDeleteBusy(status)`（"deleting" | "deleted"）。 */
  accountDeleteBusy: boolean;
};

/**
 * 設定画面の `useScreenBack` の `onIntercept` が使う判定（純粋関数）。SS-46。
 *
 * Android のシステムバックは、ダイアログ（RN の `Modal`）の表示中は `Modal` の `onRequestClose` が受け、
 * 画面の `BackHandler` には届かない（`Dialog` の JSDoc 参照）。ここが効くのは、ダイアログの表示中に
 * 画面上の戻るボタンなどから `goBack()` が呼ばれた経路で、その場合もシステムバックと同じ結果に揃える。
 *
 * 対象はログアウトとアカウント削除のダイアログ。同時に開くことは無いが、開いているものを1つずつ見る。
 * 表示名の変更のダイアログ（`DisplayNameSetting` が状態を持つ）は入れない。表示中は画面上の戻るボタンが
 * `Modal` に覆われて押せず、システムバックは `Modal` の `onRequestClose` に届くので、表示中に `goBack()` が呼ばれる経路が無い。
 * ダイアログの中から `goBack()` を呼ぶ操作を足すときは、状態を `SettingsView` に上げてここに足す。
 *
 * `.tsx` に条件を書かずここに置くのは、この repo の Vitest ではコンポーネントのレンダリングテストが書けないため。
 */
export function resolveSettingsDialogBack({
  logoutDialogOpen,
  isSigningOut,
  accountDeleteDialogOpen,
  accountDeleteBusy,
}: SettingsDialogBackInput): SettingsDialogBackAction {
  if (accountDeleteDialogOpen) {
    return accountDeleteBusy ? "consume" : "close-account-delete";
  }
  if (logoutDialogOpen) {
    return isSigningOut ? "consume" : "close-logout";
  }
  return "none";
}

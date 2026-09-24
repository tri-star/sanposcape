/**
 * アカウント削除の進行状態。`useWalkDelete` の `WalkDeleteStatus` と同じ4値だが、
 * 別の型として持つ（feature 境界をまたいで型を共有しない）。
 * "deleted" は削除成功後、AuthGate の退避が完了するまでの一瞬だけ通る。
 */
export type AccountDeleteStatus = "idle" | "deleting" | "deleted" | "error";

/**
 * 削除操作を受け付けてはいけない状態か（= ダイアログの操作系を disabled にすべきか）を判定する。
 *
 * "deleting" だけでなく "deleted"（削除成功後）も busy 扱いにする。削除成功後の後始末
 * （`authService.signOut()` → `onSessionChange(null)` → `useAuthSessionStore.setSession(null)`
 * → `AuthGate` の `useEffect` による `dismissAll()` + `replace("/(auth)/sign-in")`）は
 * 複数レンダーを挟む非同期チェーンであり、1フレームでは終わらない
 * （`useAuthSessionStore` のセッターと `AuthGate` の退避処理の間に必ずレンダーが挟まるため）。
 * この窓の間 "deleted" を busy 扱いにしないと、「削除する」ボタンの `disabled` が
 * 一時的に外れて再タップ可能になり、既に削除済みのアカウントへ2回目の `DELETE /users/me` が
 * 飛んで 401（`"サインインの有効期限が切れました…"`）が、直前の削除成功と矛盾する形で
 * 一瞬表示されてしまう（SS-62 ローカルレビュー A-1）。
 */
export function isAccountDeleteBusy(status: AccountDeleteStatus): boolean {
  return status === "deleting" || status === "deleted";
}

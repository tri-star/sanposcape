/**
 * アカウント削除の進行状態。`useWalkDelete` の `WalkDeleteStatus` と同じ4値だが、
 * 別の型として持つ（feature 境界をまたいで型を共有しない）。
 * "deleted" は削除成功後、AuthGate の退避が完了するまでの一瞬だけ通る。
 */
export type AccountDeleteStatus = "idle" | "deleting" | "deleted" | "error";

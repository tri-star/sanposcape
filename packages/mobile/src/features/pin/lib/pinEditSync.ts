import type { PinEditBaseline, PinEditDraft } from "@/features/pin/lib/pinEditDraft";
import { createPinEditBaseline } from "@/features/pin/lib/pinEditDraft";
import type { PinReadErrorCode } from "@/features/pin/lib/pinReadError";
import type { PinDetail, PinPhoto } from "@/features/pin/types";

/**
 * 保存が途中まで進んだとき（部分保存）に、編集画面の「基準値」と「下書き」を、サーバーに
 * 反映済みの状態へ追従させる純粋関数群（SS-119 レビュー A-1）。
 *
 * 追従しないと、次の問題が起きる:
 * - PATCH 成功後に写真の段で失敗し、名前を元の値へ戻すと、古い基準値と一致して差分が0件になり、
 *   PATCH が送られない（サーバーは新しい名前のまま「保存した」扱いになる）。
 * - DELETE 済みの写真が `photoIdsToDelete` に残り、印を外すと通常の写真として表示される。
 * - 再試行で同じ PATCH を再送し、古いスナップショットで他のメンバーの更新を上書きしうる。
 */

/** PATCH の成功応答（最新のピン）で基準値を作り直す。以降の差分は「保存済みの状態」との差になる。 */
export function rebaseBaselineAfterUpdate(updated: PinDetail): PinEditBaseline {
  return createPinEditBaseline(updated);
}

/** DELETE 済みの写真を、削除の印から外す（サーバーに既に無いので「印」を持つ意味が無い）。 */
export function rebaseDraftAfterPhotoDeleted(draft: PinEditDraft, photoId: string): PinEditDraft {
  if (!draft.photoIdsToDelete.includes(photoId)) return draft;
  return { ...draft, photoIdsToDelete: draft.photoIdsToDelete.filter((id) => id !== photoId) };
}

/** この画面で DELETE に成功した写真の id を重複なく足す。 */
export function addDeletedPhotoId(ids: readonly string[], photoId: string): readonly string[] {
  return ids.includes(photoId) ? ids : [...ids, photoId];
}

/**
 * 既存写真の一覧と総数から、DELETE 済みの写真を外す。
 * 総数は削除済みの枚数だけ減らす（0 未満にならない）。
 */
export function excludeDeletedPhotos(input: {
  photos: readonly PinPhoto[];
  photoCount: number;
  deletedPhotoIds: readonly string[];
}): { photos: PinPhoto[]; photoCount: number } {
  if (input.deletedPhotoIds.length === 0) {
    return { photos: [...input.photos], photoCount: input.photoCount };
  }
  const deleted = new Set(input.deletedPhotoIds);
  return {
    photos: input.photos.filter((photo) => !deleted.has(photo.id)),
    photoCount: Math.max(0, input.photoCount - deleted.size),
  };
}

/**
 * 基準値を確定してよいか（SS-119 レビュー A-2）。
 * invalidate 済みの古いキャッシュで確定すると、保存前の値が入力欄に出てしまうため、
 * 詳細の再取得が終わる（`isFetching` が false）まで待つ。再取得が失敗したときも、古い値では
 * 確定せず、エラー（再試行）を見せる。
 */
export function canConfirmPinEditBaseline(input: {
  hasPin: boolean;
  isFetching: boolean;
  hasError: boolean;
}): boolean {
  return input.hasPin && !input.isFetching && !input.hasError;
}

/**
 * 編集画面の本文判定に渡すエラー（SS-119 レビュー A-3）。
 * 基準値の確定後は、バックグラウンドの再取得の失敗（通信・サーバー）でフォームを消さない
 * （入力中の内容が失われるため）。ピンが無くなった（not_found）ときだけは見せる。
 */
export function resolvePinEditBodyError(
  errorCode: PinReadErrorCode | null,
  hasBaseline: boolean,
): PinReadErrorCode | null {
  if (errorCode === null) return null;
  if (hasBaseline && errorCode !== "not_found") return null;
  return errorCode;
}

import type { PinUpdate } from "@/api/generated/model";
import { isEmptyPinUpdate } from "@/features/pin/lib/pinEditDraft";
import { PinEditError } from "@/features/pin/lib/pinEditError";

export type PinEditSaveProgress =
  | { step: "updating" }
  | { step: "deleting_photos"; done: number; total: number }
  | { step: "sending_photos"; sent: number; total: number };

export type PinEditSaveDeps = {
  pinId: string;
  /** 保存開始時点で固定した差分（submit 時のスナップショット）。 */
  request: PinUpdate;
  /** 保存開始時点で固定した削除対象。 */
  photoIdsToDelete: readonly string[];
  /** この画面で既に削除できた写真（再試行で同じ DELETE を投げ直さない）。 */
  isPhotoDeleted: (photoId: string) => boolean;
  markPhotoDeleted: (photoId: string) => void;
  updatePin: (pinId: string, request: PinUpdate) => Promise<unknown>;
  deletePinPhoto: (pinId: string, photoId: string) => Promise<{ alreadyDeleted: boolean }>;
  /** 追加写真の送信と紐付け（`runAttachPhotosToPin` を部分適用したもの）。追加写真が無ければ通信しない。 */
  attachPhotos: (onProgress: (p: { sent: number; total: number }) => void) => Promise<void>;
  onProgress: (progress: PinEditSaveProgress) => void;
};

/**
 * 「変更を保存」1回分の手順。React にも react-native にも依存しない async 関数で、依存はすべて注入する
 * （`runPinSave` と同じ設計）。失敗は `PinEditError(stage, cause)` で throw する。
 *
 * 順序の理由:
 * - PATCH を最初にするのは、原子的で軽く、ユーザーにとって主要な変更だから。
 * - 写真の削除を追加より先にするのは、容量（アップロード者に計上。DB 集計で即時に空く）を先に空けて、
 *   写真の差し替えで `quota_exceeded` になりにくくするため。
 *
 * 再試行の安全性（失敗後は最初からやり直してよい）:
 * - PATCH は差分なので再送してよい（ADR-009 決定20。追加済みのタグは何もせず成功、無いタグの削除は無視）。
 * - DELETE は 404 を成功扱いにするので再送してよい。
 * - 写真の追加は `runPinSave` の「紐付け済みから再開」で再送してよい。
 * そのため段階の完了フラグは持たない。写真の削除だけは、無駄な往復を省くために記録する。
 */
export async function runPinEditSave(deps: PinEditSaveDeps): Promise<void> {
  if (!isEmptyPinUpdate(deps.request)) {
    deps.onProgress({ step: "updating" });
    try {
      await deps.updatePin(deps.pinId, deps.request);
    } catch (error) {
      throw new PinEditError("update", error);
    }
  }

  const pending = deps.photoIdsToDelete.filter((id) => !deps.isPhotoDeleted(id));
  let done = 0;
  for (const photoId of pending) {
    try {
      // 404（既に無い）は deletePinPhoto が成功に読み替える。
      await deps.deletePinPhoto(deps.pinId, photoId);
    } catch (error) {
      throw new PinEditError("delete_photos", error);
    }
    deps.markPhotoDeleted(photoId);
    done += 1;
    deps.onProgress({ step: "deleting_photos", done, total: pending.length });
  }

  try {
    await deps.attachPhotos((p) =>
      deps.onProgress({ step: "sending_photos", sent: p.sent, total: p.total }),
    );
  } catch (error) {
    // PinSaveError のまま包む。分類は toPinEditErrorCode が剥がす。
    throw new PinEditError("add_photos", error);
  }
}

import type { PinUpdate } from "@/api/generated/model";
import { isEmptyPinUpdate } from "@/features/pin/lib/pinEditDraft";
import { PinEditError } from "@/features/pin/lib/pinEditError";
import type { PinDetail } from "@/features/pin/types";

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
  /** この保存で PATCH に成功済みか（成功後の再試行で同じ PATCH を再送しない）。 */
  isUpdated: () => boolean;
  /** PATCH の成功応答（最新のピン）。基準値の作り直しと詳細キャッシュの差し替えに使う。 */
  onUpdated: (updated: PinDetail) => void;
  updatePin: (pinId: string, request: PinUpdate) => Promise<PinDetail>;
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
 * - PATCH は成功したら `isUpdated` で記録し、再送しない。再送すると、古いスナップショットで他のメンバーの
 *   更新を上書きしうる（last-write-wins）。成功前に失敗した場合は、差分なので再送してよい
 *   （ADR-009 決定20。追加済みのタグは何もせず成功、無いタグの削除は無視）。
 *   手動の再試行は、成功応答で作り直した基準値から差分を取り直すため、そもそも PATCH が空になる。
 * - DELETE は 404 を成功扱いにするので再送してよい。
 * - 写真の追加は `runPinSave` の「紐付け済みから再開」で再送してよい。
 * そのため段階の完了フラグは持たない。写真の削除だけは、無駄な往復を省くために記録する。
 */
export async function runPinEditSave(deps: PinEditSaveDeps): Promise<void> {
  if (!isEmptyPinUpdate(deps.request) && !deps.isUpdated()) {
    deps.onProgress({ step: "updating" });
    let updated: PinDetail;
    try {
      updated = await deps.updatePin(deps.pinId, deps.request);
    } catch (error) {
      throw new PinEditError("update", error);
    }
    deps.onUpdated(updated);
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

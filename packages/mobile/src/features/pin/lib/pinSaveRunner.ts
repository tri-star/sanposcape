import { ApiError } from "@/api/apiError";
import type { PinCreate } from "@/api/generated/model";
import { PIN_PHOTOS_PER_REQUEST_MAX } from "@/features/pin/lib/pinLimits";
import {
  isTransientPhotoUploadError,
  isWaitablePhotoUploadError,
  toPhotoUploadErrorCode,
} from "@/features/pin/lib/photoUploadError";
import { nextAttachChunk } from "@/features/pin/lib/photoDraft";
import type { PhotoDraftAction } from "@/features/pin/lib/photoDraft";
import { PhotoSlotsBusyError, PinSaveError } from "@/features/pin/lib/pinSaveError";
import type { PinSaveStage } from "@/features/pin/lib/pinSaveError";
import type { PhotoDraftItem, PinSaveProgress, SavedPin } from "@/features/pin/types";
import { describeError, logDiagnostic } from "@/lib/diagnosticLog";

export type PinSaveRunnerDeps = {
  /** 呼ぶたびに最新の写真リスト（表示順・削除済みを除く）を返す。 */
  getItems: () => readonly PhotoDraftItem[];
  dispatch: (action: PhotoDraftAction) => void;
  /** 作成済みピンの ID（前回の実行で作成まで進んでいれば非 null）。 */
  getSavedPinId: () => string | null;
  setSavedPinId: (pinId: string) => void;
  /** 写真以外が確定した作成リクエストを、紐付ける枠 ID から組み立てる（buildPinCreateRequest を部分適用したもの）。 */
  buildCreateRequest: (photoUploadIds: readonly string[]) => PinCreate | null;
  createPin: (request: PinCreate) => Promise<{ pin: SavedPin; attachedUploadIds: string[] }>;
  addPinPhotos: (
    pinId: string,
    uploadIds: readonly string[],
  ) => Promise<{ photoCount: number; attachedUploadIds: string[] }>;
  /** 1枚分の枠発行 → 直送（api/pinPhotoTransfer.ts）。成功で uploadId。 */
  transferPhoto: (item: PhotoDraftItem) => Promise<string>;
  /** 先行アップロードの進行中タスクが終わるのを待つ（保存中は先行アップロードを止め、実行を1本化する）。 */
  awaitBackgroundIdle: () => Promise<void>;
  onProgress: (progress: PinSaveProgress) => void;
};

/**
 * チャンクの写真を先頭から順に揃える。`waiting`/`failed` は転送を試み、`uploaded` はそのまま
 * 数える。成功した uploadId を**表示順の連続した先頭から**集める（失敗/待機に当たった時点で
 * 打ち切るため、結果は自然に「先頭から連続」になる）。
 *
 * 戻り値の `readyUploadIds` が空、かつ `stopReason` が `"slots_busy"` のときだけ、
 * 呼び出し側は「空けられる枠が無い」と判断する。
 */
async function assembleReadyUploadIds(
  chunk: readonly PhotoDraftItem[],
  deps: Pick<PinSaveRunnerDeps, "dispatch" | "transferPhoto">,
  stage: PinSaveStage,
  savedPinId: string | null,
): Promise<string[]> {
  const readyUploadIds: string[] = [];

  for (const item of chunk) {
    if (item.status === "uploaded") {
      if (item.uploadId !== null) {
        readyUploadIds.push(item.uploadId);
      }
      continue;
    }

    if (item.status !== "waiting" && item.status !== "failed") {
      // processing / uploading 等、転送対象でない状態が紛れていたら安全側で打ち切る
      // （通常は起きない。保存前に awaitBackgroundIdle 済みで、UI も processing 中は保存不可にする）。
      break;
    }

    deps.dispatch({ type: "uploadStarted", localId: item.localId });
    try {
      const uploadId = await deps.transferPhoto(item);
      deps.dispatch({ type: "uploaded", localId: item.localId, uploadId });
      readyUploadIds.push(uploadId);
    } catch (error) {
      const code = toPhotoUploadErrorCode(error);
      // 先行アップロード（usePinPhotos）と同じ理由で、分類結果と生の例外を対応付けて残す。
      logDiagnostic("pin-photo.upload.failed", {
        localId: item.localId,
        stage,
        code,
        ...describeError(error),
      });
      if (isWaitablePhotoUploadError(code)) {
        // 429: エラーにしない。待機に戻し、ここまでに揃った分を紐付けて枠を空けるのを優先する。
        deps.dispatch({ type: "waited", localId: item.localId });
        break;
      }
      if (isTransientPhotoUploadError(code)) {
        deps.dispatch({ type: "waited", localId: item.localId });
        throw new PinSaveError(stage, error, savedPinId);
      }
      // 再試行しても同じ失敗になるもの（too_large 等）。ユーザーが削除するか判断する。
      deps.dispatch({ type: "failed", localId: item.localId, errorCode: code });
      throw new PinSaveError(stage, error, savedPinId);
    }
  }

  return readyUploadIds;
}

/**
 * 保存フローを最後まで実行する。途中で失敗したら `PinSaveError` を投げる
 * （状態は dispatch 済みなので再実行で続きから進む。改訂2の「紐付け済みの記録から再開」）。
 *
 * React にも react-native にも依存しない async 関数。API・状態操作をすべて注入することで
 * vitest で網羅的にテストする（backend の未使用枠上限を模型サーバーで再現する）。
 */
export async function runPinSave(deps: PinSaveRunnerDeps): Promise<SavedPin> {
  await deps.awaitBackgroundIdle();

  // このメソッド実行内で createPin から得たピンの情報（あれば）。addPinPhotos は
  // 地図情報を返さないため、再試行（前回の実行で作成済み＝ pinId は既知）で
  // 一度も createPin を呼ばない実行では sanpoMapId/sanpoMapName が空文字のままになりうる
  // （登録画面はこの値を表示に使わないため実害はない）。
  let pin: SavedPin | null = null;

  for (;;) {
    const items = deps.getItems();
    const pinId = deps.getSavedPinId();
    const stage: PinSaveStage = pinId === null ? "create" : "add_photos";

    const chunk = nextAttachChunk(items, PIN_PHOTOS_PER_REQUEST_MAX);
    if (pinId !== null && chunk.length === 0) {
      break;
    }

    const ready = await assembleReadyUploadIds(chunk, deps, stage, pinId);

    if (pinId === null) {
      deps.onProgress({ step: "creating" });
      const request = deps.buildCreateRequest(ready);
      if (request === null) {
        // 呼び出し前に画面側でバリデーション済みのはずだが、万一に備えて invalid_request
        // （再試行不可）として分類させる。"unknown" は自動再試行の対象なので使わない。
        throw new PinSaveError("create", new ApiError(422), null);
      }
      try {
        const result = await deps.createPin(request);
        deps.setSavedPinId(result.pin.id);
        deps.dispatch({ type: "attached", uploadIds: result.attachedUploadIds });
        pin = result.pin;
      } catch (error) {
        // 応答が失われても、応答喪失後の再実行で `pinId` はまだ null のままなので
        // createPin を再度呼べば回復する（backend は client_pin_id で冪等）。
        throw new PinSaveError("create", error, null);
      }
    } else if (ready.length > 0) {
      try {
        const result = await deps.addPinPhotos(pinId, ready);
        deps.dispatch({ type: "attached", uploadIds: result.attachedUploadIds });
        if (pin === null) {
          pin = { id: pinId, sanpoMapId: "", sanpoMapName: "", photoCount: result.photoCount };
        } else {
          pin = {
            id: pin.id,
            sanpoMapId: pin.sanpoMapId,
            sanpoMapName: pin.sanpoMapName,
            photoCount: result.photoCount,
          };
        }
      } catch (error) {
        throw new PinSaveError("add_photos", error, pinId);
      }
    } else {
      // このチャンクの先頭で 429 を受け、手元に紐付けて空けられる枠も無い。
      // 枠を占有しているのは別の登録画面・別端末が残した未使用枠なので、この画面では空けられない。
      throw new PinSaveError("add_photos", new PhotoSlotsBusyError(), pinId);
    }

    const attachedCount = deps.getItems().filter((item) => item.status === "attached").length;
    deps.onProgress({ step: "sending_photos", sent: attachedCount, total: deps.getItems().length });
  }

  if (pin === null) {
    // 到達しないはず（pinId !== null になった時点で必ず pin が入っている）。型のための防波堤。
    const pinId = deps.getSavedPinId();
    const attachedCount = deps.getItems().filter((item) => item.status === "attached").length;
    pin = { id: pinId ?? "", sanpoMapId: "", sanpoMapName: "", photoCount: attachedCount };
  }
  return pin;
}

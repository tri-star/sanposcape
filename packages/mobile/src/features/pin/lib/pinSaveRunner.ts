import { ApiError, isApiError } from "@/api/apiError";
import type { PinCreate } from "@/api/generated/model";
import { PIN_PHOTOS_PER_REQUEST_MAX } from "@/features/pin/lib/pinLimits";
import {
  isTransientPhotoUploadError,
  isWaitablePhotoUploadError,
  toPhotoUploadErrorCode,
} from "@/features/pin/lib/photoUploadError";
import { isUploadNearAttachDeadline, nextAttachChunk } from "@/features/pin/lib/photoDraft";
import type { PhotoDraftAction } from "@/features/pin/lib/photoDraft";
import {
  PhotoSlotsBusyError,
  PinSaveError,
  isPinSaveError,
  toPinSaveErrorCode,
} from "@/features/pin/lib/pinSaveError";
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
  /**
   * 使わなくなった未紐付けの枠を backend から解放する（`DELETE /pin-photo-uploads/{id}` を best-effort で。
   * 失敗しても投げない）。期限の近い枠を取り直すときに古い枠を手放すのに使う（SS-126）。
   */
  discardUpload: (uploadId: string) => void;
  /** 現在時刻（epoch ms）。`uploaded` の時刻の記録と、紐付け期限が近いかの判定に使う。 */
  now: () => number;
  /** 先行アップロードの進行中タスクが終わるのを待つ（保存中は先行アップロードを止め、実行を1本化する）。 */
  awaitBackgroundIdle: () => Promise<void>;
  onProgress: (progress: PinSaveProgress) => void;
};

/** チャンクを揃えた結果。`reusedLocalIds` はこの実行より前から持っていた枠（先行アップロード・前回の実行の分）。 */
type AssembledChunk = { uploadIds: string[]; reusedLocalIds: string[] };

/**
 * `uploaded` の写真の枠を捨てて `waiting` に戻し、古い枠を backend から解放する（SS-126）。
 * 写真は次に揃えるときに新しい枠で送り直される。
 */
function discardUploadedPhoto(
  item: PhotoDraftItem,
  uploadId: string,
  deps: Pick<PinSaveRunnerDeps, "dispatch" | "discardUpload">,
  reason: "near_deadline" | "not_ready",
): void {
  logDiagnostic("pin-photo.upload.reissued", { localId: item.localId, uploadId, reason });
  deps.dispatch({ type: "uploadDiscarded", localId: item.localId });
  deps.discardUpload(uploadId);
}

/**
 * 1枚を送る。成功で uploadId、429 で待機に戻したときは null（呼び出し側はチャンクを打ち切る）。
 * それ以外の失敗は `PinSaveError` で投げる。
 */
async function transferChunkItem(
  item: PhotoDraftItem,
  deps: Pick<PinSaveRunnerDeps, "dispatch" | "transferPhoto" | "now">,
  stage: PinSaveStage,
  savedPinId: string | null,
): Promise<string | null> {
  deps.dispatch({ type: "uploadStarted", localId: item.localId });
  try {
    const uploadId = await deps.transferPhoto(item);
    deps.dispatch({ type: "uploaded", localId: item.localId, uploadId, uploadedAt: deps.now() });
    return uploadId;
  } catch (error) {
    const code = toPhotoUploadErrorCode(error);
    // 先行アップロード（usePinPhotos）と同じ理由で、分類結果と生の例外を対応付けて残す。
    // あちらと違い `isAbortError` のガードは要らない。保存フローの `transferPhoto`
    // （`usePinPhotos.ts` の `transferPhotoForSave`）は自前の AbortController しか持たず、
    // それを abort するのは `withTimeout` のタイムアウトだけで、そのとき呼び出し側に届くのは
    // `TypeError("Pin photo transfer timed out")`（`Promise.race` の勝者）だから。
    // 将来 `transferPhoto` に外部から signal を渡せるようにしたら、ここにもガードが要る。
    logDiagnostic("pin-photo.upload.failed", {
      localId: item.localId,
      stage,
      code,
      ...describeError(error),
    });
    if (isWaitablePhotoUploadError(code)) {
      // 429: エラーにしない。待機に戻し、ここまでに揃った分を紐付けて枠を空けるのを優先する。
      deps.dispatch({ type: "waited", localId: item.localId });
      return null;
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

/**
 * チャンクの写真を先頭から順に揃える。`waiting`/`failed` は転送を試み、`uploaded` はそのまま
 * 数える。ただしピンの作成後は、`uploaded` でも紐付け期限が近い枠を捨てて送り直す（SS-126）。
 * 作成前（`savedPinId === null`）はしない: createPin の応答が失われた後の再実行では、サーバーで
 * 既に紐付いた枠が端末では `uploaded` のまま残っており、送り直すと冪等な createPin が既存のピンを
 * 返した後に新しい枠が addPinPhotos で付き、同じ写真が二重になる。作成前の期限切れは createPin の
 * 409 を受けてからのやり直し（`shouldReissueAfterNotReady`。409 ならピンは作られていない）に任せる。
 * 成功した uploadId を
 * **表示順の連続した先頭から**集める（失敗/待機に当たった時点で打ち切るため、結果は自然に「先頭から連続」になる）。
 *
 * 戻り値の `uploadIds` が空のとき、呼び出し側（作成済み）は「空けられる枠が無い」と判断する。
 */
async function assembleReadyUploadIds(
  chunk: readonly PhotoDraftItem[],
  deps: Pick<PinSaveRunnerDeps, "dispatch" | "transferPhoto" | "discardUpload" | "now">,
  stage: PinSaveStage,
  savedPinId: string | null,
): Promise<AssembledChunk> {
  const uploadIds: string[] = [];
  const reusedLocalIds: string[] = [];

  for (const item of chunk) {
    if (item.status === "uploaded") {
      if (item.uploadId === null) {
        continue; // 起きない（uploaded は必ず uploadId を伴う）。型の防波堤
      }
      if (savedPinId === null || !isUploadNearAttachDeadline(item, deps.now())) {
        uploadIds.push(item.uploadId);
        reusedLocalIds.push(item.localId);
        continue;
      }
      discardUploadedPhoto(item, item.uploadId, deps, "near_deadline");
    } else if (item.status !== "waiting" && item.status !== "failed") {
      // processing / uploading 等、転送対象でない状態が紛れていたら安全側で打ち切る
      // （通常は起きない。保存前に awaitBackgroundIdle 済みで、UI も processing 中は保存不可にする）。
      break;
    }

    const uploadId = await transferChunkItem(item, deps, stage, savedPinId);
    if (uploadId === null) {
      break;
    }
    uploadIds.push(uploadId);
  }

  return { uploadIds, reusedLocalIds };
}

/**
 * 揃えた枠を紐付ける（未作成なら createPin、作成済みなら addPinPhotos）。API の例外はそのまま投げ、
 * 呼び出し側が 409 のやり直しの判断と `PinSaveError` への包みを行う。
 */
async function attachChunk(
  deps: PinSaveRunnerDeps,
  pinId: string | null,
  uploadIds: readonly string[],
  pin: SavedPin | null,
): Promise<SavedPin> {
  if (pinId === null) {
    deps.onProgress({ step: "creating" });
    const request = deps.buildCreateRequest(uploadIds);
    if (request === null) {
      // 呼び出し前に画面側でバリデーション済みのはずだが、万一に備えて invalid_request
      // （再試行不可）として分類させる。"unknown" は自動再試行の対象なので使わない。
      throw new PinSaveError("create", new ApiError(422), null);
    }
    // 応答が失われても、応答喪失後の再実行で `pinId` はまだ null のままなので
    // createPin を再度呼べば回復する（backend は client_pin_id で冪等）。
    const result = await deps.createPin(request);
    deps.setSavedPinId(result.pin.id);
    deps.dispatch({ type: "attached", uploadIds: result.attachedUploadIds });
    return result.pin;
  }

  if (uploadIds.length === 0) {
    // このチャンクの先頭で 429 を受け、手元に紐付けて空けられる枠も無い。
    // 枠を占有しているのは別の登録画面・別端末が残した未使用枠なので、この画面では空けられない。
    throw new PinSaveError("add_photos", new PhotoSlotsBusyError(), pinId);
  }

  const result = await deps.addPinPhotos(pinId, uploadIds);
  deps.dispatch({ type: "attached", uploadIds: result.attachedUploadIds });
  if (pin === null) {
    return { id: pinId, sanpoMapId: "", sanpoMapName: "", photoCount: result.photoCount };
  }
  return { ...pin, photoCount: result.photoCount };
}

/**
 * 紐付けの失敗が「以前からの枠が期限切れだったかもしれない」409 で、まだやり直していないか（SS-126）。
 * 409 `photo_upload_not_ready` は期限切れ・未完了・デコード不可を区別しない（ADR-021）ため、
 * 以前からの枠が含まれるときだけ、それらを送り直して1回だけやり直す。容量超過の 409 は対象外。
 */
function shouldReissueAfterNotReady(
  error: unknown,
  reusedLocalIds: readonly string[],
  alreadyReissued: boolean,
): boolean {
  return (
    !alreadyReissued &&
    reusedLocalIds.length > 0 &&
    !isPinSaveError(error) &&
    isApiError(error) &&
    error.status === 409 &&
    toPinSaveErrorCode(error) === "photo_not_ready"
  );
}

function discardReusedPhotos(reusedLocalIds: readonly string[], deps: PinSaveRunnerDeps): void {
  const reused = new Set(reusedLocalIds);
  for (const item of deps.getItems()) {
    if (reused.has(item.localId) && item.status === "uploaded" && item.uploadId !== null) {
      discardUploadedPhoto(item, item.uploadId, deps, "not_ready");
    }
  }
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
  // 409 `photo_upload_not_ready` を受けて以前からの枠を送り直したか（1回の実行で1回だけ。SS-126）。
  let reissuedAfterNotReady = false;

  for (;;) {
    const items = deps.getItems();
    const pinId = deps.getSavedPinId();
    const stage: PinSaveStage = pinId === null ? "create" : "add_photos";

    const chunk = nextAttachChunk(items, PIN_PHOTOS_PER_REQUEST_MAX);
    if (pinId !== null && chunk.length === 0) {
      break;
    }

    const assembled = await assembleReadyUploadIds(chunk, deps, stage, pinId);

    try {
      pin = await attachChunk(deps, pinId, assembled.uploadIds, pin);
    } catch (error) {
      if (shouldReissueAfterNotReady(error, assembled.reusedLocalIds, reissuedAfterNotReady)) {
        // 以前からの枠が紐付け期限を過ぎていた可能性がある（端末の時計のずれ・期限の設定の変更で
        // 先回りの判定を外れた場合）。それらを捨てて、同じチャンクを新しい枠で揃え直す。
        reissuedAfterNotReady = true;
        discardReusedPhotos(assembled.reusedLocalIds, deps);
        continue;
      }
      throw isPinSaveError(error) ? error : new PinSaveError(stage, error, pinId);
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

export type AttachPhotosDeps = Omit<
  PinSaveRunnerDeps,
  "getSavedPinId" | "setSavedPinId" | "buildCreateRequest" | "createPin"
> & { pinId: string };

/**
 * 既存のピンへ写真を追加する（SS-119 の編集画面）。`runPinSave` を「作成済み（savedPinId = pinId）」
 * として実行する。pinId が非 null なので createPin / buildCreateRequest は呼ばれない
 * （呼ばれたら到達不能のバグとして throw する）。
 * 戻り値は最終的な写真総数（追加写真が無ければ通信せず attached 数）。
 *
 * `onProgress` は `{step:"creating"}` を出しうる型だが、この経路では出ない。
 * 呼び出し側は `sending_photos` だけを写せばよい。
 */
export async function runAttachPhotosToPin(
  deps: AttachPhotosDeps,
): Promise<{ photoCount: number }> {
  const { pinId, ...rest } = deps;
  const pin = await runPinSave({
    ...rest,
    getSavedPinId: () => pinId,
    setSavedPinId: () => {},
    buildCreateRequest: () => null,
    createPin: () => Promise.reject(new Error("unreachable: pin already exists")),
  });
  return { photoCount: pin.photoCount };
}

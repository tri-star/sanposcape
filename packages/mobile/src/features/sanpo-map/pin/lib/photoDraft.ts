import { PIN_PHOTO_UPLOAD_REUSE_MAX_AGE_MS } from "@/features/sanpo-map/pin/lib/pinLimits";
import type { PhotoUploadErrorCode } from "@/features/sanpo-map/pin/lib/photoUploadError";
import type { PickedPhoto, PreparedPhoto } from "@/services/photo/types";

/**
 * 写真1枚の状態。
 * - processing: 端末で縮小・再圧縮中（まだ prepared が無い）
 * - waiting: 加工済み。枠が空くのを待っている（先行アップロードの上限超過・429 を受けた・保存フローの順番待ち）
 * - uploading: 枠発行 → 直送の最中
 * - uploaded: S3 にあり、まだピンに紐付いていない（backend の「未使用枠」を1つ占有している）
 * - attached: ピンに紐付いた（枠は解放された）
 * - failed: 送れない（ユーザーが再試行 or 削除する）
 */
export type PhotoDraftStatus =
  | "processing"
  | "waiting"
  | "uploading"
  | "uploaded"
  | "attached"
  | "failed";

/** 写真1枚の状態。localId は画面内だけの識別子（randomUuidV4）。 */
export type PhotoDraftItem = {
  localId: string;
  previewUri: string;
  picked: PickedPhoto;
  prepared: PreparedPhoto | null;
  status: PhotoDraftStatus;
  /** アップロード枠 ID（uploaded / attached のとき非 null）。 */
  uploadId: string | null;
  /**
   * `uploaded` になった時刻（端末の時計の epoch ms。uploaded / attached のとき非 null）。保存時に、紐付け期限
   * （backend 既定 6 時間）が近い枠を使わずに取り直すかの判定に使う（`isUploadNearAttachDeadline`。SS-126）。
   */
  uploadedAt: number | null;
  errorCode: PhotoUploadErrorCode | null;
};

export type PhotoDraftAction =
  | { type: "added"; items: Array<{ localId: string; picked: PickedPhoto }> } // processing
  | { type: "prepared"; localId: string; prepared: PreparedPhoto } // previewUri 差し替え、waiting
  | { type: "uploadStarted"; localId: string } // waiting → uploading
  | { type: "uploaded"; localId: string; uploadId: string; uploadedAt: number } // uploading → uploaded
  | { type: "uploadDiscarded"; localId: string } // uploaded → waiting（期限の近い枠を捨てて送り直す。SS-126）
  | { type: "waited"; localId: string } // uploading/failed → waiting（429・一時失敗）
  | { type: "attached"; uploadIds: readonly string[] } // uploadId 一致の uploaded → attached
  | { type: "failed"; localId: string; errorCode: PhotoUploadErrorCode }
  | { type: "retried"; localId: string } // failed → prepared があれば waiting、無ければ processing
  | { type: "removed"; localId: string }; // attached は削除させない（無視）

/**
 * 写真1枚ごとの状態遷移。存在しない localId へのアクションは無変化（削除した写真が遅れて
 * 届いた結果で復活しない保証）。attached の写真は removed / failed / waited を無視する
 * （サーバーに紐付いた事実は取り消せない。削除は編集チケットの範囲）。
 */
export function photoDraftReducer(
  state: PhotoDraftItem[],
  action: PhotoDraftAction,
): PhotoDraftItem[] {
  switch (action.type) {
    case "added": {
      const added: PhotoDraftItem[] = action.items.map(({ localId, picked }) => ({
        localId,
        previewUri: picked.uri,
        picked,
        prepared: null,
        status: "processing",
        uploadId: null,
        uploadedAt: null,
        errorCode: null,
      }));
      return [...state, ...added];
    }

    case "prepared":
      return updateItem(state, action.localId, (item) => ({
        ...item,
        prepared: action.prepared,
        previewUri: action.prepared.uri,
        status: "waiting",
      }));

    case "uploadStarted":
      return updateItem(state, action.localId, (item) => ({ ...item, status: "uploading" }));

    case "uploaded":
      return updateItem(state, action.localId, (item) => ({
        ...item,
        status: "uploaded",
        uploadId: action.uploadId,
        uploadedAt: action.uploadedAt,
        errorCode: null,
      }));

    case "uploadDiscarded":
      // 紐付け前の枠だけを捨てる（attached はサーバーに紐付いた事実を取り消せないので無変化）。
      return updateItem(state, action.localId, (item) =>
        item.status === "uploaded"
          ? { ...item, status: "waiting", uploadId: null, uploadedAt: null, errorCode: null }
          : item,
      );

    case "waited":
      return updateItem(state, action.localId, (item) =>
        item.status === "attached" ? item : { ...item, status: "waiting", errorCode: null },
      );

    case "attached": {
      const uploadIds = new Set(action.uploadIds);
      return state.map((item) =>
        item.status === "uploaded" && item.uploadId !== null && uploadIds.has(item.uploadId)
          ? { ...item, status: "attached" }
          : item,
      );
    }

    case "failed":
      return updateItem(state, action.localId, (item) =>
        item.status === "attached"
          ? item
          : { ...item, status: "failed", errorCode: action.errorCode },
      );

    case "retried":
      return updateItem(state, action.localId, (item) => ({
        ...item,
        status: item.prepared !== null ? "waiting" : "processing",
        errorCode: null,
      }));

    case "removed":
      return state.filter((item) => item.localId !== action.localId || item.status === "attached");

    default:
      return state;
  }
}

function updateItem(
  state: PhotoDraftItem[],
  localId: string,
  update: (item: PhotoDraftItem) => PhotoDraftItem,
): PhotoDraftItem[] {
  return state.map((item) => (item.localId === localId ? update(item) : item));
}

/**
 * 先行アップロード済みの枠が、紐付けに使うには古すぎるか（SS-126）。`uploaded` になってから
 * `PIN_PHOTO_UPLOAD_REUSE_MAX_AGE_MS` 以上たっていれば true（backend の紐付け期限が近い・過ぎた）。
 * 端末の時計が戻って経過が負になった場合は false（紐付けの 409 を受けてからのやり直しに任せる）。
 */
export function isUploadNearAttachDeadline(item: PhotoDraftItem, now: number): boolean {
  return (
    item.status === "uploaded" &&
    item.uploadedAt !== null &&
    now - item.uploadedAt >= PIN_PHOTO_UPLOAD_REUSE_MAX_AGE_MS
  );
}

/** 未紐付けの枠をこの画面が占有している数（uploading + uploaded）。 */
export function heldUploadSlots(state: readonly PhotoDraftItem[]): number {
  return state.filter((item) => item.status === "uploading" || item.status === "uploaded").length;
}

/**
 * 先行アップロード（保存前のバックグラウンド処理）が次にやる仕事。
 * - 先頭から最初の processing → { kind: "prepare" }（加工は枠を使わないので常に進める）
 * - それが無く、paused でなく、heldUploadSlots + extraHeldSlots < limit なら、先頭から
 *   最初の waiting → { kind: "transfer" }
 * - それ以外 null（待機写真は保存フローが送る）
 *
 * `extraHeldSlots`（PR #93 T11）: この draft の state からは消えたが backend 側ではまだ
 * 未使用枠として残っている可能性がある数（削除時の `DELETE /pin-photo-uploads/{id}` が
 * 失敗した場合の「幽霊枠」）。呼び出し側（`usePinPhotos`）が管理し、素の
 * `heldUploadSlots(state)` に加算してから上限判定する。
 */
export function nextPreuploadWork(
  state: readonly PhotoDraftItem[],
  options: { limit: number; paused: boolean; extraHeldSlots?: number },
): { kind: "prepare" | "transfer"; item: PhotoDraftItem } | null {
  const processing = state.find((item) => item.status === "processing");
  if (processing) {
    return { kind: "prepare", item: processing };
  }

  if (options.paused) {
    return null;
  }
  if (heldUploadSlots(state) + (options.extraHeldSlots ?? 0) >= options.limit) {
    return null;
  }

  const waiting = state.find((item) => item.status === "waiting");
  if (waiting) {
    return { kind: "transfer", item: waiting };
  }

  return null;
}

/** 保存フローが次に紐付けるチャンク: attached 以外の先頭から最大 perRequest 枚（表示順）。 */
export function nextAttachChunk(
  state: readonly PhotoDraftItem[],
  perRequest: number,
): PhotoDraftItem[] {
  return state.filter((item) => item.status !== "attached").slice(0, perRequest);
}

export type PhotoDraftSummary = {
  total: number;
  attached: number;
  uploaded: number;
  waiting: number;
  inProgress: number;
  failed: number;
};

export function photoDraftSummary(state: readonly PhotoDraftItem[]): PhotoDraftSummary {
  const counts: Record<PhotoDraftStatus, number> = {
    processing: 0,
    waiting: 0,
    uploading: 0,
    uploaded: 0,
    attached: 0,
    failed: 0,
  };
  for (const item of state) {
    counts[item.status] += 1;
  }
  return {
    total: state.length,
    attached: counts.attached,
    uploaded: counts.uploaded,
    waiting: counts.waiting,
    inProgress: counts.processing + counts.uploading,
    failed: counts.failed,
  };
}

/** `PinPhotoGrid` の見出し下に出す補足行。該当する状態が無ければ null。 */
export function photoGridCaption(summary: PhotoDraftSummary): string | null {
  if (summary.total === 0) {
    return null;
  }

  const parts: string[] = [];
  const done = summary.attached + summary.uploaded;
  if (done > 0) {
    parts.push(`${done} 枚アップロード済み`);
  }
  if (summary.waiting > 0) {
    parts.push(`${summary.waiting} 枚は保存時に送信します`);
  }
  if (summary.inProgress > 0) {
    parts.push(`${summary.inProgress} 枚をアップロード中`);
  }
  if (summary.failed > 0) {
    parts.push(`${summary.failed} 枚が送信できませんでした`);
  }
  return parts.length > 0 ? parts.join("・") : null;
}

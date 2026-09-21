import { isApiError } from "@/api/apiError";
import { toPhotoUploadErrorCode } from "@/features/pin/lib/photoUploadError";
import type { PinSaveProgress } from "@/features/pin/types";

/**
 * 保存失敗の分類。409 は本文を読めないため区別できず（`ApiError` は本文を持たない）、
 * まとめて `photo_not_ready` とする（MVP。区別が必要になったら `client.ts` の改修が要る）。
 * `quota_exceeded` は型にだけ予約し、この分類関数からは返さない。
 */
export type PinSaveErrorCode =
  | "unauthorized" // 401
  | "forbidden" // 403（MVP では発生しない予約）
  | "sanpo_map_not_found" // 404（作成時）/ ピンが見つからない（写真追加時。通常起きない）
  | "photo_not_ready" // 409 "Photo upload not ready"（枠の期限切れ・S3 に実体が無い・デコード不可 等）
  | "quota_exceeded" // 409 "Storage quota exceeded"（実サイズでの容量超過。型にのみ予約）
  | "invalid_request" // 413 / 422 / buildPinCreateRequest が null
  | "storage_unavailable" // 503（ストレージ障害・確定処理の時間切れ。冪等なので再送で回復しうる）
  | "photo_rejected" // 待機写真の送信が再試行しても同じ失敗（too_large 等）。該当写真は failed
  | "photo_slots_busy" // PhotoSlotsBusyError（他所の未使用枠で枠が空かない。時間で回復）
  | "network"
  | "server" // その他 5xx
  | "unknown";

export type PinSaveStage = "create" | "add_photos";

/** runPinSave が「空けられる枠が無い」ときに投げる（cause として PinSaveError に包む）。 */
export class PhotoSlotsBusyError extends Error {
  readonly isPhotoSlotsBusyError = true;

  constructor() {
    super("No pin photo upload slots available to free up right now.");
    this.name = "PhotoSlotsBusyError";
  }
}

export function isPhotoSlotsBusyError(error: unknown): error is PhotoSlotsBusyError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { isPhotoSlotsBusyError?: boolean }).isPhotoSlotsBusyError === true
  );
}

/** 保存処理が投げる例外。どの段階で失敗したか（ピンが作成済みか）を運ぶ。 */
export class PinSaveError extends Error {
  readonly isPinSaveError = true;

  constructor(
    readonly stage: PinSaveStage,
    readonly cause: unknown,
    readonly savedPinId: string | null,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "PinSaveError";
  }
}

export function isPinSaveError(error: unknown): error is PinSaveError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { isPinSaveError?: boolean }).isPinSaveError === true
  );
}

/**
 * 任意の例外を PinSaveErrorCode に分類する（純粋）。`PinSaveError` で包まれていれば
 * `cause` を剥がして分類する。写真送信由来の cause（`transferPhoto` の例外）は
 * `toPhotoUploadErrorCode` で分類し、一時的なもの → network/server/storage_unavailable、
 * 再試行しても同じもの → `photo_rejected` に写す。
 */
export function toPinSaveErrorCode(error: unknown): PinSaveErrorCode {
  const cause = isPinSaveError(error) ? error.cause : error;

  if (isPhotoSlotsBusyError(cause)) {
    return "photo_slots_busy";
  }

  if (isApiError(cause)) {
    if (cause.status >= 500) {
      return cause.status === 503 ? "storage_unavailable" : "server";
    }
    switch (cause.status) {
      case 401:
        return "unauthorized";
      case 403:
        return "forbidden";
      case 404:
        return "sanpo_map_not_found";
      case 409:
        return "photo_not_ready";
      case 413:
      case 422:
        return "invalid_request";
      default:
        return "unknown";
    }
  }

  if (cause instanceof TypeError) {
    return "network";
  }

  // 写真送信由来の例外（S3UploadError / PhotoError 等）は写真アップロードの分類器に委ねる。
  const photoCode = toPhotoUploadErrorCode(cause);
  switch (photoCode) {
    case "too_large":
    case "processing_failed":
    case "invalid_upload_url":
      return "photo_rejected";
    case "server":
    case "storage_unavailable":
      return photoCode;
    case "expired":
    case "network":
      // 期限切れ（署名の有効期限切れ）は新しい枠を取り直せば回復するため network と同様に扱う。
      return "network";
    case "unauthorized":
      return "unauthorized";
    case "quota_exceeded":
      return "quota_exceeded";
    default:
      return "unknown";
  }
}

type PinSaveMessages = Record<PinSaveErrorCode, { create: string; add_photos: string }>;

const ADD_PHOTOS_PREFIX = "ピンは保存しました。まだ送れていない写真があります。";

const MESSAGES: PinSaveMessages = {
  unauthorized: {
    create: "サインインするとピンを保存できます。",
    add_photos: `${ADD_PHOTOS_PREFIX}もう一度保存すると続きから送ります。`,
  },
  forbidden: {
    create: "このピンを保存する権限がありません。",
    add_photos: `${ADD_PHOTOS_PREFIX}このピンを操作する権限がありません。`,
  },
  sanpo_map_not_found: {
    create: "選んだ地図が見つかりませんでした。地図を選び直してください。",
    add_photos: `${ADD_PHOTOS_PREFIX}ピンが見つかりませんでした。`,
  },
  photo_not_ready: {
    create: "写真の準備ができていません。失敗した写真を削除して追加し直してください。",
    add_photos: `${ADD_PHOTOS_PREFIX}印の付いた写真を削除してから、もう一度保存してください。`,
  },
  quota_exceeded: {
    create: "写真の保存容量（1人あたり1GB）の上限に達しました。",
    add_photos: `${ADD_PHOTOS_PREFIX}写真の保存容量（1人あたり1GB）の上限に達しました。`,
  },
  invalid_request: {
    create: "この内容では保存できませんでした。入力を確認してください。",
    add_photos: `${ADD_PHOTOS_PREFIX}この内容では送れませんでした。`,
  },
  storage_unavailable: {
    create: "写真の保存に失敗しました。時間をおいて再試行してください。",
    add_photos: `${ADD_PHOTOS_PREFIX}もう一度保存すると続きから送ります。`,
  },
  photo_rejected: {
    create: "印の付いた写真を削除してから、もう一度保存してください。",
    add_photos: `${ADD_PHOTOS_PREFIX}印の付いた写真を削除してから、もう一度保存してください。`,
  },
  photo_slots_busy: {
    create:
      "写真の送信枠が空くまで少し時間がかかっています。しばらくしてからもう一度保存してください。",
    add_photos: `${ADD_PHOTOS_PREFIX}写真の送信枠が空くまで少し時間がかかっています。しばらくしてからもう一度保存してください。`,
  },
  network: {
    create: "通信に失敗しました。電波状況を確認して再試行してください。",
    add_photos: `${ADD_PHOTOS_PREFIX}もう一度保存すると続きから送ります。`,
  },
  server: {
    create: "サーバーで問題が発生しました。時間をおいて再試行してください。",
    add_photos: `${ADD_PHOTOS_PREFIX}もう一度保存すると続きから送ります。`,
  },
  unknown: {
    create: "ピンの保存に失敗しました。もう一度お試しください。",
    add_photos: `${ADD_PHOTOS_PREFIX}もう一度保存すると続きから送ります。`,
  },
};

export function pinSaveErrorMessage(code: PinSaveErrorCode, stage: PinSaveStage): string {
  return MESSAGES[code][stage];
}

/** 自動再試行してよいか（usePinSave の retry 述語）。紐付け済みの記録から再開し、全 API が冪等なので安全。 */
const AUTO_RETRIABLE_CODES = new Set<PinSaveErrorCode>([
  "network",
  "server",
  "storage_unavailable",
  "unknown",
]);

export function isRetriablePinSaveError(code: PinSaveErrorCode): boolean {
  return AUTO_RETRIABLE_CODES.has(code);
}

/** 画面に「もう一度保存する」を出すか。unauthorized はサインインボタン、それ以外の確定的失敗は false。 */
const MANUAL_RETRIABLE_CODES = new Set<PinSaveErrorCode>([
  ...AUTO_RETRIABLE_CODES,
  "photo_slots_busy",
  "photo_rejected",
]);

export function canManuallyRetryPinSave(code: PinSaveErrorCode): boolean {
  return MANUAL_RETRIABLE_CODES.has(code);
}

/** 保存ボタンのラベル・進捗表示に使う文言。View に組み立てロジックを書かない。 */
export function pinSaveProgressLabel(progress: PinSaveProgress): string {
  if (progress.step === "creating") {
    return "保存しています…";
  }
  return `写真を送信中 ${progress.sent}/${progress.total} 枚`;
}

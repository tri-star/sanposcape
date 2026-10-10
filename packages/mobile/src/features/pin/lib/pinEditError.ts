import { getApiErrorCode, isApiError } from "@/api/apiError";
import type { PinEditSaveProgress } from "@/features/pin/lib/pinEditSaveRunner";
import { toPinSaveErrorCode } from "@/features/pin/lib/pinSaveError";

/** 編集保存の段階。PATCH → 写真の削除 → 写真の追加 の順に実行する。 */
export type PinEditStage = "update" | "delete_photos" | "add_photos";

/** 編集保存が投げる例外。どの段階で失敗したかを運ぶ（`PinSaveError` と同じ形）。 */
export class PinEditError extends Error {
  readonly isPinEditError = true;

  constructor(
    readonly stage: PinEditStage,
    readonly cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "PinEditError";
  }
}

/** ブランド判定（`instanceof` は Hermes/トランスパイル環境で不安定なので使わない）。 */
export function isPinEditError(error: unknown): error is PinEditError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { isPinEditError?: boolean }).isPinEditError === true
  );
}

export type PinEditErrorCode =
  | "unauthorized" // 401
  | "forbidden" // 403
  | "pin_not_found" // 404（PATCH・写真追加）
  | "sanpo_map_not_found" // 404 + code（PATCH の移動先。SS-175）
  | "tag_limit_exceeded" // 409 + code
  | "photo_not_ready" // 写真追加の 409
  | "quota_exceeded" // 写真追加の容量超過
  | "photo_rejected"
  | "photo_slots_busy"
  | "invalid_request" // 413 / 422
  | "storage_unavailable" // 503
  | "network"
  | "server"
  | "unknown";

/**
 * 任意の例外を PinEditErrorCode に分類する（純粋）。`PinEditError` で包まれていなければ
 * stage = "update" として扱う。写真追加段は `toPinSaveErrorCode` に委ね、
 * `sanpo_map_not_found`（地図/ピンが見つからない）を `pin_not_found` に写す。
 */
export function toPinEditErrorCode(error: unknown): PinEditErrorCode {
  const stage: PinEditStage = isPinEditError(error) ? error.stage : "update";
  const cause = isPinEditError(error) ? error.cause : error;

  if (stage === "add_photos") {
    const code = toPinSaveErrorCode(cause);
    if (code === "sanpo_map_not_found") return "pin_not_found";
    return code;
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
        // sanpo_map_not_found 以外の 404（code 無しを含む）はピンが無いと読む（SS-175）。
        return getApiErrorCode(cause) === "sanpo_map_not_found"
          ? "sanpo_map_not_found"
          : "pin_not_found";
      case 409:
        return getApiErrorCode(cause) === "tag_limit_exceeded" ? "tag_limit_exceeded" : "unknown";
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
  return "unknown";
}

/** 後続の段が未実行であることを伝える先頭の文。 */
const PARTIAL_PREFIX_DELETE = "ここまでの変更は保存しました。";
const PARTIAL_PREFIX_ADD = PARTIAL_PREFIX_DELETE;
const RESUME = "もう一度保存すると続きから行います。";

const UPDATE_FAILED = "変更を保存できませんでした。";

type StageMessages = { update: string; delete_photos: string; add_photos: string };

const MESSAGES: Record<PinEditErrorCode, StageMessages> = {
  unauthorized: {
    update: `${UPDATE_FAILED}サインインし直してください。`,
    delete_photos: `${PARTIAL_PREFIX_DELETE}サインインし直してください。`,
    add_photos: `${PARTIAL_PREFIX_ADD}サインインし直してください。`,
  },
  forbidden: {
    update: "この変更を保存する権限がありません。",
    delete_photos: `${PARTIAL_PREFIX_DELETE}削除する権限のない写真が含まれています。`,
    add_photos: `${PARTIAL_PREFIX_ADD}このピンを操作する権限がありません。`,
  },
  pin_not_found: {
    update: "このピンは削除されています。",
    delete_photos: "このピンは削除されています。",
    add_photos: "このピンは削除されています。",
  },
  sanpo_map_not_found: {
    update: "移動先の地図が見つかりませんでした。地図を選び直してください。",
    delete_photos: `${PARTIAL_PREFIX_DELETE}${RESUME}`, // 到達しない（型の網羅のため）
    add_photos: `${PARTIAL_PREFIX_ADD}${RESUME}`, // 到達しない（add_photos の 404 は pin_not_found に写す）
  },
  tag_limit_exceeded: {
    update:
      "タグは10個までです。ほかの人が追加したタグがある可能性があります。タグを減らしてから保存してください。",
    delete_photos: `${PARTIAL_PREFIX_DELETE}${RESUME}`,
    add_photos: `${PARTIAL_PREFIX_ADD}${RESUME}`,
  },
  photo_not_ready: {
    update: `${UPDATE_FAILED}もう一度お試しください。`,
    delete_photos: `${PARTIAL_PREFIX_DELETE}${RESUME}`,
    add_photos: `${PARTIAL_PREFIX_ADD}写真の準備ができていません。印の付いた写真を削除してから、もう一度保存してください。`,
  },
  quota_exceeded: {
    update: `${UPDATE_FAILED}もう一度お試しください。`,
    delete_photos: `${PARTIAL_PREFIX_DELETE}${RESUME}`,
    add_photos: `${PARTIAL_PREFIX_ADD}写真の保存容量（1人あたり1GB）の上限に達しました。`,
  },
  photo_rejected: {
    update: `${UPDATE_FAILED}もう一度お試しください。`,
    delete_photos: `${PARTIAL_PREFIX_DELETE}${RESUME}`,
    add_photos: `${PARTIAL_PREFIX_ADD}印の付いた写真を削除してから、もう一度保存してください。`,
  },
  photo_slots_busy: {
    update: `${UPDATE_FAILED}もう一度お試しください。`,
    delete_photos: `${PARTIAL_PREFIX_DELETE}${RESUME}`,
    add_photos: `${PARTIAL_PREFIX_ADD}写真の送信枠が空くまで少し時間がかかっています。しばらくしてからもう一度保存してください。`,
  },
  invalid_request: {
    update: `${UPDATE_FAILED}入力内容を確認してください。`,
    delete_photos: `${PARTIAL_PREFIX_DELETE}写真を削除できませんでした。`,
    add_photos: `${PARTIAL_PREFIX_ADD}この内容では写真を送れませんでした。`,
  },
  storage_unavailable: {
    update: `${UPDATE_FAILED}時間をおいて再試行してください。`,
    delete_photos: `${PARTIAL_PREFIX_DELETE}${RESUME}`,
    add_photos: `${PARTIAL_PREFIX_ADD}${RESUME}`,
  },
  network: {
    update: `${UPDATE_FAILED}通信に失敗しました。電波状況を確認して再試行してください。`,
    delete_photos: `${PARTIAL_PREFIX_DELETE}${RESUME}`,
    add_photos: `${PARTIAL_PREFIX_ADD}${RESUME}`,
  },
  server: {
    update: `${UPDATE_FAILED}サーバーで問題が発生しました。時間をおいて再試行してください。`,
    delete_photos: `${PARTIAL_PREFIX_DELETE}${RESUME}`,
    add_photos: `${PARTIAL_PREFIX_ADD}${RESUME}`,
  },
  unknown: {
    update: `${UPDATE_FAILED}もう一度お試しください。`,
    delete_photos: `${PARTIAL_PREFIX_DELETE}${RESUME}`,
    add_photos: `${PARTIAL_PREFIX_ADD}${RESUME}`,
  },
};

export function pinEditErrorMessage(code: PinEditErrorCode, stage: PinEditStage): string {
  return MESSAGES[code][stage];
}

/** 自動再試行してよいか。全段が冪等なので、一時的な失敗だけ再試行する。 */
const AUTO_RETRIABLE_CODES = new Set<PinEditErrorCode>([
  "network",
  "server",
  "storage_unavailable",
  "unknown",
]);

export function isRetriablePinEditError(code: PinEditErrorCode): boolean {
  return AUTO_RETRIABLE_CODES.has(code);
}

const MANUAL_RETRIABLE_CODES = new Set<PinEditErrorCode>([
  ...AUTO_RETRIABLE_CODES,
  "photo_slots_busy",
  "photo_rejected",
]);

/** 画面に「もう一度保存する」を出すか。それ以外の確定的な失敗は、入力を変えれば再度押せる。 */
export function canManuallyRetryPinEdit(code: PinEditErrorCode): boolean {
  return MANUAL_RETRIABLE_CODES.has(code);
}

/** 保存ボタンのラベル・進捗表示に使う文言。 */
export function pinEditProgressLabel(progress: PinEditSaveProgress): string {
  switch (progress.step) {
    case "updating":
      return "保存しています…";
    case "deleting_photos":
      return `写真を削除中 ${progress.done}/${progress.total} 枚`;
    case "sending_photos":
      return `写真を送信中 ${progress.sent}/${progress.total} 枚`;
  }
}

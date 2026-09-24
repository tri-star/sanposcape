import type { PhotoErrorCode } from "@/services/photo/types";

export class PhotoError extends Error {
  readonly isPhotoError = true;

  constructor(
    readonly code: PhotoErrorCode,
    message?: string,
    readonly cause?: unknown,
  ) {
    super(message ?? code);
    this.name = "PhotoError";
  }
}

export function isPhotoError(error: unknown): error is PhotoError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { isPhotoError?: boolean }).isPhotoError === true
  );
}

/**
 * 任意の例外を PhotoError へ正規化する。expo-image-picker / expo-image-manipulator の
 * エラー形状はコード化が難しいため、`fallback` を呼び出し側の文脈（pick か prepare か）に
 * 応じて渡す（`toLocationError` ほどの詳細なコード分類はしない）。
 */
export function toPhotoError(error: unknown, fallback: PhotoErrorCode): PhotoError {
  if (isPhotoError(error)) {
    return error;
  }
  return new PhotoError(fallback, error instanceof Error ? error.message : undefined, error);
}

const MESSAGES: Record<PhotoErrorCode, string> = {
  permission_denied: "カメラの利用が許可されていません。設定から許可してください。",
  camera_unavailable: "この端末ではカメラを利用できません。",
  processing_failed: "写真の読み込みに失敗しました。別の写真でお試しください。",
  unknown: "写真を追加できませんでした。もう一度お試しください。",
};

/** ユーザー向け文言。 */
export function photoErrorMessage(code: PhotoErrorCode): string {
  return MESSAGES[code];
}

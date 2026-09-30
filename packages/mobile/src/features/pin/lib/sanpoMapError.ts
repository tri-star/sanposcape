import { isApiError } from "@/api/apiError";
import type { PinReadErrorCode } from "@/features/pin/lib/pinReadError";

/** `POST /sanpo-maps` の失敗分類。 */
export type SanpoMapCreateErrorCode =
  | "unauthorized" // 401
  | "invalid_name" // 422
  | "network" // TypeError
  | "server" // 5xx
  | "unknown"; // 413 ほか

/**
 * 任意の例外を `SanpoMapCreateErrorCode` に分類する（純粋）。`pinReadError.ts` と同じく
 * `isApiError` で status を見る（`instanceof ApiError` は使わない）。TypeError だけ `instanceof`。
 */
export function toSanpoMapCreateErrorCode(error: unknown): SanpoMapCreateErrorCode {
  if (isApiError(error)) {
    if (error.status >= 500) return "server";
    switch (error.status) {
      case 401:
        return "unauthorized";
      case 422:
        return "invalid_name";
      default:
        return "unknown";
    }
  }
  if (error instanceof TypeError) return "network";
  return "unknown";
}

const CREATE_MESSAGES: Record<SanpoMapCreateErrorCode, string> = {
  unauthorized: "サインインし直してから、もう一度お試しください。",
  invalid_name: "この名前では作成できません。1〜50文字で入力してください。",
  network:
    "通信に失敗しました。電波状況を確認して、もう一度お試しください。作成できていた場合は一覧に表示されます。",
  server: "サーバーで問題が発生しました。時間をおいてお試しください。",
  unknown: "地図を作成できませんでした。もう一度お試しください。",
};

export function sanpoMapCreateErrorMessage(code: SanpoMapCreateErrorCode): string {
  return CREATE_MESSAGES[code];
}

const READ_MESSAGES: Record<"maps" | "pins", Record<PinReadErrorCode, string>> = {
  maps: {
    unauthorized: "サインインし直すと表示できます。",
    not_found: "この地図は見つかりませんでした。削除された可能性があります。",
    invalid_cursor: "地図の一覧を取得できませんでした。もう一度お試しください。",
    invalid_request: "地図の一覧を取得できませんでした。",
    network: "通信に失敗しました。電波状況を確認して再試行してください。",
    server: "地図の一覧を取得できませんでした。時間をおいて再試行してください。",
    unknown: "地図の一覧の取得に失敗しました。もう一度お試しください。",
  },
  pins: {
    unauthorized: "サインインし直すと表示できます。",
    not_found: "この地図は見つかりませんでした。削除された可能性があります。",
    invalid_cursor: "ピンの一覧の読み込み位置が古くなりました。もう一度お試しください。",
    invalid_request: "ピンの一覧を取得できませんでした。",
    network: "通信に失敗しました。電波状況を確認して再試行してください。",
    server: "ピンの一覧を取得できませんでした。時間をおいて再試行してください。",
    unknown: "ピンの一覧の取得に失敗しました。もう一度お試しください。",
  },
};

/**
 * 地図一覧・地図詳細の読み込みエラーの文言。分類は `toPinReadErrorCode` を再利用し、
 * 「ピン」「写真」前提の `pinReadErrorMessage` は使わない。再試行ボタンの要否は
 * `isRetriablePinReadError` を使う。
 */
export function sanpoMapReadErrorMessage(code: PinReadErrorCode, target: "maps" | "pins"): string {
  return READ_MESSAGES[target][code];
}

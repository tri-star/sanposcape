import type { PinPhoto, PinPhotoPage } from "@/features/pin/types";
import type { PinReadErrorCode } from "@/features/pin/lib/pinReadError";
import { formatDateLabel, formatTimeLabel, parseIsoDate } from "@/lib/dateLabel";

export type PinDetailBodyState =
  | "invalid-id"
  | "sign-in-required"
  | "not-found"
  | "error"
  | "loading"
  | "ready";

export type ResolvePinDetailBodyStateInput = {
  hasPinId: boolean;
  isSignedIn: boolean;
  errorCode: PinReadErrorCode | null;
  isLoading: boolean;
  hasPin: boolean;
};

/**
 * 詳細画面が「今どの状態を描画するか」を決める純粋関数。
 *
 * 判定順（この順序が仕様）: invalid-id → sign-in-required → not-found → error → loading → ready
 * ゲストでも `hasPinId` が false（ディープリンクの不正値）なら invalid-id を先に返す
 * （サインインしても解決しない問題を優先して伝える）。
 */
export function resolvePinDetailBodyState(
  input: ResolvePinDetailBodyStateInput,
): PinDetailBodyState {
  if (!input.hasPinId) {
    return "invalid-id";
  }
  if (!input.isSignedIn) {
    return "sign-in-required";
  }
  if (input.errorCode === "not_found") {
    return "not-found";
  }
  if (input.errorCode !== null) {
    return "error";
  }
  if (input.isLoading || !input.hasPin) {
    return "loading";
  }
  return "ready";
}

/** 名前なし（null・空白のみ）のときのフォールバック。 */
export const UNNAMED_PIN_LABEL = "名前のないピン";

export function pinDisplayName(name: string | null): string {
  if (name === null || name.trim().length === 0) {
    return UNNAMED_PIN_LABEL;
  }
  return name;
}

/**
 * 「7月2日(水) 09:14」。年が違えば年を前置する（`src/lib/dateLabel` の
 * `formatDateLabel` + `formatTimeLabel`）。不正な ISO は null。
 */
export function formatPinCreatedAt(iso: string, now: Date = new Date()): string | null {
  const date = parseIsoDate(iso);
  if (date === null) return null;
  return `${formatDateLabel(date, now)} ${formatTimeLabel(date)}`;
}

/**
 * グリッド・拡大表示に使う写真リストを決める。
 * - `pages` が1ページ以上あれば、その items を連結（id で重複排除）し、
 *   `hasMore` = 最終ページの `nextCursor !== null`
 * - `pages` が無ければ `detailPhotos` を使い、`hasMore` = `photoCount > detailPhotos.length`
 */
export function resolvePinDetailPhotos(input: {
  detailPhotos: readonly PinPhoto[];
  photoCount: number;
  pages: readonly PinPhotoPage[] | undefined;
}): { photos: PinPhoto[]; hasMore: boolean } {
  const { pages } = input;

  if (pages !== undefined && pages.length > 0) {
    const seen = new Set<string>();
    const photos: PinPhoto[] = [];
    for (const page of pages) {
      for (const photo of page.items) {
        if (seen.has(photo.id)) continue;
        seen.add(photo.id);
        photos.push(photo);
      }
    }
    const lastPage = pages[pages.length - 1];
    return { photos, hasMore: lastPage !== undefined && lastPage.nextCursor !== null };
  }

  return {
    photos: [...input.detailPhotos],
    hasMore: input.photoCount > input.detailPhotos.length,
  };
}

/**
 * 画像の読み込み失敗時に URL を取り直すか。取得から `minAgeMs` 以上経っていれば true
 * （取り直した直後の失敗で再取得を繰り返さない）。`dataUpdatedAt === 0`（未取得）は false。
 */
export const PHOTO_URL_REFRESH_MIN_AGE_MS = 60_000;

export function shouldRefreshPhotoUrls(input: {
  dataUpdatedAt: number;
  now: number;
  minAgeMs?: number;
}): boolean {
  if (input.dataUpdatedAt <= 0) return false;
  const minAgeMs = input.minAgeMs ?? PHOTO_URL_REFRESH_MIN_AGE_MS;
  return input.now - input.dataUpdatedAt >= minAgeMs;
}

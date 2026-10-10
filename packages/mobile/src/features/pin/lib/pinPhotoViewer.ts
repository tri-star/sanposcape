import { formatDateLabel, formatTimeLabel, parseIsoDate } from "@/lib/dateLabel";
import type { PinPhoto } from "@/features/pin/types";

/** 件数が減った（同時削除など）ときに index を収める。count=0 は null（ビューアを閉じる）。 */
export function clampViewerIndex(index: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.min(Math.max(index, 0), count - 1);
}

export type ViewerNext = "go" | "load-more" | "disabled";

/**
 * 前後ボタンの状態。先頭で prev は無効（循環しない。ページングがあるため）。
 * 最後に読み込んだ写真で `hasMore` なら "load-more"（読み込み中は "disabled"）。
 */
export function resolveViewerNav(input: {
  index: number;
  loadedCount: number;
  hasMore: boolean;
  isLoadingMore: boolean;
}): { canPrev: boolean; next: ViewerNext } {
  const canPrev = input.index > 0;
  const isLast = input.index >= input.loadedCount - 1;

  if (!isLast) {
    return { canPrev, next: "go" };
  }
  if (!input.hasMore) {
    return { canPrev, next: "disabled" };
  }
  return { canPrev, next: input.isLoadingMore ? "disabled" : "load-more" };
}

/** 「3 / 12」。分母はサーバーの総数（photoCount）。 */
export function viewerCounterLabel(index: number, photoCount: number): string {
  return `${index + 1} / ${photoCount}`;
}

export const PHOTO_TAKEN_AT_PREFIX = "撮影";
export const PHOTO_UPLOADED_AT_PREFIX = "アップロード";

export type ViewerPhotoDate = { kind: "taken" | "uploaded"; label: string };

function formatWithPrefix(prefix: string, iso: string | null, now: Date): string | null {
  if (iso === null) return null;
  const date = parseIsoDate(iso);
  if (date === null) return null;
  return `${prefix} ${formatDateLabel(date, now)} ${formatTimeLabel(date)}`;
}

/**
 * ビューア上部に出す日時。撮影日時があれば「撮影 7月2日(木) 09:14」、無いか解釈できなければ
 * 「アップロード 7月2日(木) 09:14」（どちらを出しているかを文言で区別する。SS-163）。
 * 年が now と違えば年を前置する（`formatDateLabel`）。端末のタイムゾーンで表示する。
 * 両方とも解釈できなければ null（行を出さない）。
 */
export function resolveViewerPhotoDate(
  photo: Pick<PinPhoto, "takenAt" | "uploadedAt">,
  now: Date = new Date(),
): ViewerPhotoDate | null {
  const taken = formatWithPrefix(PHOTO_TAKEN_AT_PREFIX, photo.takenAt, now);
  if (taken !== null) return { kind: "taken", label: taken };
  const uploaded = formatWithPrefix(PHOTO_UPLOADED_AT_PREFIX, photo.uploadedAt, now);
  if (uploaded !== null) return { kind: "uploaded", label: uploaded };
  return null;
}

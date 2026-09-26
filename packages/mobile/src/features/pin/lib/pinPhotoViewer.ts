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

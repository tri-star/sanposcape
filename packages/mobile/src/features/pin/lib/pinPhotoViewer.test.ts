import { describe, expect, it } from "vitest";

import {
  clampViewerIndex,
  resolveViewerNav,
  viewerCounterLabel,
} from "@/features/pin/lib/pinPhotoViewer";

describe("clampViewerIndex", () => {
  it("count が0なら null（ビューアを閉じる）", () => {
    expect(clampViewerIndex(0, 0)).toBeNull();
  });

  it("index が範囲内ならそのまま", () => {
    expect(clampViewerIndex(2, 5)).toBe(2);
  });

  it("index が count を超えたら末尾に収める", () => {
    expect(clampViewerIndex(10, 5)).toBe(4);
  });

  it("index が負なら0に収める", () => {
    expect(clampViewerIndex(-1, 5)).toBe(0);
  });
});

describe("resolveViewerNav", () => {
  it("先頭では prev が無効", () => {
    const result = resolveViewerNav({
      index: 0,
      loadedCount: 5,
      hasMore: false,
      isLoadingMore: false,
    });
    expect(result.canPrev).toBe(false);
  });

  it("中間では prev が有効・next は go", () => {
    const result = resolveViewerNav({
      index: 2,
      loadedCount: 5,
      hasMore: true,
      isLoadingMore: false,
    });
    expect(result.canPrev).toBe(true);
    expect(result.next).toBe("go");
  });

  it("末尾で hasMore が false なら next は disabled", () => {
    const result = resolveViewerNav({
      index: 4,
      loadedCount: 5,
      hasMore: false,
      isLoadingMore: false,
    });
    expect(result.next).toBe("disabled");
  });

  it("末尾で hasMore が true・読込中でなければ load-more", () => {
    const result = resolveViewerNav({
      index: 4,
      loadedCount: 5,
      hasMore: true,
      isLoadingMore: false,
    });
    expect(result.next).toBe("load-more");
  });

  it("末尾で hasMore が true・読込中なら disabled", () => {
    const result = resolveViewerNav({
      index: 4,
      loadedCount: 5,
      hasMore: true,
      isLoadingMore: true,
    });
    expect(result.next).toBe("disabled");
  });

  it("count 0（loadedCount 0）でも例外にならない", () => {
    const result = resolveViewerNav({
      index: 0,
      loadedCount: 0,
      hasMore: false,
      isLoadingMore: false,
    });
    expect(result.canPrev).toBe(false);
    expect(result.next).toBe("disabled");
  });
});

describe("viewerCounterLabel", () => {
  it("「3 / 12」のように整形する", () => {
    expect(viewerCounterLabel(2, 12)).toBe("3 / 12");
  });
});

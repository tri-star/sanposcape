import { describe, expect, it } from "vitest";

import { formatDateLabel, formatTimeLabel } from "@/lib/dateLabel";
import {
  clampViewerIndex,
  resolveViewerNav,
  resolveViewerPhotoDate,
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

describe("resolveViewerPhotoDate", () => {
  const now = new Date(2026, 9, 10, 12, 0);
  const local = (y: number, m: number, d: number, h: number, mi: number) =>
    new Date(y, m - 1, d, h, mi).toISOString();
  const uploadedAt = local(2026, 7, 3, 10, 0);

  it("撮影日時があれば「撮影」で出す", () => {
    expect(resolveViewerPhotoDate({ takenAt: local(2026, 7, 2, 9, 14), uploadedAt }, now)).toEqual({
      kind: "taken",
      label: "撮影 7月2日(木) 09:14",
    });
  });

  it("年が違えば年を前置する", () => {
    expect(resolveViewerPhotoDate({ takenAt: local(2025, 7, 2, 9, 14), uploadedAt }, now)).toEqual({
      kind: "taken",
      label: "撮影 2025年7月2日(水) 09:14",
    });
  });

  it("takenAt が null ならアップロード日時", () => {
    expect(resolveViewerPhotoDate({ takenAt: null, uploadedAt }, now)).toEqual({
      kind: "uploaded",
      label: "アップロード 7月3日(金) 10:00",
    });
  });

  it("takenAt が不正な文字列ならアップロード日時にフォールバックする", () => {
    expect(resolveViewerPhotoDate({ takenAt: "not-a-date", uploadedAt }, now)?.kind).toBe(
      "uploaded",
    );
  });

  it("両方不正なら null", () => {
    expect(resolveViewerPhotoDate({ takenAt: "x", uploadedAt: "y" }, now)).toBeNull();
  });

  it.each(["2026-07-02T00:14:00Z", "2026-07-02T00:14:00+00:00"])(
    "backend の UTC 形式（%s）を端末のタイムゾーンで出す",
    (takenAt) => {
      const date = new Date(takenAt);
      expect(resolveViewerPhotoDate({ takenAt, uploadedAt }, now)?.label).toBe(
        `撮影 ${formatDateLabel(date, now)} ${formatTimeLabel(date)}`,
      );
    },
  );
});

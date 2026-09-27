import { describe, expect, it } from "vitest";

import {
  UNNAMED_PIN_LABEL,
  formatPinCreatedAt,
  pinDisplayName,
  resolvePinDetailBodyState,
  resolveIsLoadingMorePhotos,
  resolvePinDetailPhotos,
  shouldRefreshPhotoUrls,
} from "@/features/pin/lib/pinDetailState";
import type { PinPhoto, PinPhotoPage } from "@/features/pin/types";

describe("resolvePinDetailBodyState", () => {
  const READY_INPUT = {
    hasPinId: true,
    isSignedIn: true,
    errorCode: null,
    isLoading: false,
    hasPin: true,
  };

  it("hasPinId が false なら invalid-id（ゲストでも優先）", () => {
    expect(resolvePinDetailBodyState({ ...READY_INPUT, hasPinId: false, isSignedIn: false })).toBe(
      "invalid-id",
    );
  });

  it("ゲストは errorCode より sign-in-required が優先", () => {
    expect(
      resolvePinDetailBodyState({ ...READY_INPUT, isSignedIn: false, errorCode: "not_found" }),
    ).toBe("sign-in-required");
  });

  it("errorCode が not_found なら not-found", () => {
    expect(resolvePinDetailBodyState({ ...READY_INPUT, errorCode: "not_found" })).toBe("not-found");
  });

  it("errorCode がその他なら error", () => {
    expect(resolvePinDetailBodyState({ ...READY_INPUT, errorCode: "server" })).toBe("error");
  });

  it("isLoading なら loading", () => {
    expect(resolvePinDetailBodyState({ ...READY_INPUT, isLoading: true, hasPin: false })).toBe(
      "loading",
    );
  });

  it("hasPin が false なら loading", () => {
    expect(resolvePinDetailBodyState({ ...READY_INPUT, hasPin: false })).toBe("loading");
  });

  it("isLoading が true なら hasPin が true でも loading（isLoading が優先。SS-118 ローカルレビュー QA-S2）", () => {
    expect(resolvePinDetailBodyState({ ...READY_INPUT, isLoading: true, hasPin: true })).toBe(
      "loading",
    );
  });

  it("すべて満たせば ready", () => {
    expect(resolvePinDetailBodyState(READY_INPUT)).toBe("ready");
  });
});

describe("pinDisplayName", () => {
  it("null は名前のないピン", () => {
    expect(pinDisplayName(null)).toBe(UNNAMED_PIN_LABEL);
  });

  it("空文字は名前のないピン", () => {
    expect(pinDisplayName("")).toBe(UNNAMED_PIN_LABEL);
  });

  it("空白のみは名前のないピン", () => {
    expect(pinDisplayName("   ")).toBe(UNNAMED_PIN_LABEL);
  });

  it("通常の名前はそのまま", () => {
    expect(pinDisplayName("桜")).toBe("桜");
  });
});

describe("formatPinCreatedAt", () => {
  it("同年なら年を出さない", () => {
    const now = new Date(2026, 6, 3);
    expect(formatPinCreatedAt(new Date(2026, 6, 2, 9, 14).toISOString(), now)).toBe(
      "7月2日(木) 09:14",
    );
  });

  it("年が異なれば年を前置する", () => {
    const now = new Date(2026, 6, 3);
    expect(formatPinCreatedAt(new Date(2025, 6, 2, 9, 14).toISOString(), now)).toBe(
      "2025年7月2日(水) 09:14",
    );
  });

  it("不正な ISO は null", () => {
    expect(formatPinCreatedAt("not-a-date")).toBeNull();
  });
});

describe("resolvePinDetailPhotos", () => {
  function photo(id: string, position: number): PinPhoto {
    return { id, position, thumbnailUrl: null, originalUrl: null, width: 100, height: 100 };
  }

  it("pages が無く photoCount と detailPhotos.length が一致すれば hasMore false", () => {
    const detailPhotos = Array.from({ length: 10 }, (_, i) => photo(`p${i}`, i));
    const result = resolvePinDetailPhotos({ detailPhotos, photoCount: 10, pages: undefined });
    expect(result.photos).toEqual(detailPhotos);
    expect(result.hasMore).toBe(false);
  });

  it("pages が無く photoCount が detailPhotos.length を超えれば hasMore true", () => {
    const detailPhotos = Array.from({ length: 10 }, (_, i) => photo(`p${i}`, i));
    const result = resolvePinDetailPhotos({ detailPhotos, photoCount: 35, pages: undefined });
    expect(result.hasMore).toBe(true);
  });

  it("pages が2枚あれば連結し重複排除する", () => {
    const pages: PinPhotoPage[] = [
      { items: [photo("p0", 0), photo("p1", 1)], photoCount: 3, nextCursor: "c1" },
      { items: [photo("p1", 1), photo("p2", 2)], photoCount: 3, nextCursor: null },
    ];
    const result = resolvePinDetailPhotos({ detailPhotos: [], photoCount: 3, pages });
    expect(result.photos.map((p) => p.id)).toEqual(["p0", "p1", "p2"]);
  });

  it("最終ページの nextCursor が null なら hasMore false", () => {
    const pages: PinPhotoPage[] = [{ items: [photo("p0", 0)], photoCount: 1, nextCursor: null }];
    const result = resolvePinDetailPhotos({ detailPhotos: [], photoCount: 1, pages });
    expect(result.hasMore).toBe(false);
  });

  it("最終ページの nextCursor が非null なら hasMore true", () => {
    const pages: PinPhotoPage[] = [{ items: [photo("p0", 0)], photoCount: 5, nextCursor: "c2" }];
    const result = resolvePinDetailPhotos({ detailPhotos: [], photoCount: 5, pages });
    expect(result.hasMore).toBe(true);
  });

  it("pages が無ければ photoCount は詳細の値", () => {
    const detailPhotos = Array.from({ length: 10 }, (_, i) => photo(`p${i}`, i));
    const result = resolvePinDetailPhotos({ detailPhotos, photoCount: 35, pages: undefined });
    expect(result.photoCount).toBe(35);
  });

  it("pages があれば photoCount は最終ページの値（詳細の取得後に増減していても最新に揃える）", () => {
    const pages: PinPhotoPage[] = [
      { items: [photo("p0", 0), photo("p1", 1)], photoCount: 40, nextCursor: "c1" },
      { items: [photo("p2", 2)], photoCount: 42, nextCursor: "c2" },
    ];
    const result = resolvePinDetailPhotos({ detailPhotos: [], photoCount: 35, pages });
    expect(result.photoCount).toBe(42);
  });

  it("photoCount は読み込み済みの枚数を下回らない", () => {
    const pages: PinPhotoPage[] = [
      { items: [photo("p0", 0), photo("p1", 1), photo("p2", 2)], photoCount: 2, nextCursor: null },
    ];
    const result = resolvePinDetailPhotos({ detailPhotos: [], photoCount: 3, pages });
    expect(result.photoCount).toBe(3);
  });
});

describe("resolveIsLoadingMorePhotos", () => {
  it("次ページの取得中は true", () => {
    expect(
      resolveIsLoadingMorePhotos({
        wantsMorePhotos: true,
        isPending: false,
        isFetchingNextPage: true,
      }),
    ).toBe(true);
  });

  it("初回の「もっと見る」で最初のページを取得中（isPending）も true", () => {
    expect(
      resolveIsLoadingMorePhotos({
        wantsMorePhotos: true,
        isPending: true,
        isFetchingNextPage: false,
      }),
    ).toBe(true);
  });

  it("「もっと見る」を押す前（query が無効で isPending）は false", () => {
    expect(
      resolveIsLoadingMorePhotos({
        wantsMorePhotos: false,
        isPending: true,
        isFetchingNextPage: false,
      }),
    ).toBe(false);
  });

  it("最初のページの取得後で次ページを取得していなければ false", () => {
    expect(
      resolveIsLoadingMorePhotos({
        wantsMorePhotos: true,
        isPending: false,
        isFetchingNextPage: false,
      }),
    ).toBe(false);
  });
});

describe("shouldRefreshPhotoUrls", () => {
  it("59秒未満は false", () => {
    expect(shouldRefreshPhotoUrls({ dataUpdatedAt: 1000, now: 1000 + 59_000 })).toBe(false);
  });

  it("60秒以上は true", () => {
    expect(shouldRefreshPhotoUrls({ dataUpdatedAt: 1000, now: 1000 + 60_000 })).toBe(true);
  });

  it("dataUpdatedAt が0（未取得）なら false", () => {
    expect(shouldRefreshPhotoUrls({ dataUpdatedAt: 0, now: 1_000_000 })).toBe(false);
  });
});

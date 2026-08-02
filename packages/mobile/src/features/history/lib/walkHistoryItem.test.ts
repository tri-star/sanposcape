import { describe, expect, it } from "vitest";

import type { WalkRead } from "@/api/generated/model";
import {
  dedupeWalkHistoryItems,
  toWalkHistoryItem,
  toWalkHistoryItems,
} from "@/features/history/lib/walkHistoryItem";
import type { WalkHistoryItem } from "@/features/history/types";

const NOW = new Date("2026-08-10T00:00:00.000Z");

const READ: WalkRead = {
  id: "walk-1",
  client_walk_id: "client-1",
  started_at: "2026-08-02T14:30:00.000Z",
  ended_at: "2026-08-02T15:02:00.000Z",
  duration_seconds: 1920,
  distance_meters: 2143,
  destination: {
    place_id: "place-1",
    name: "緑町公園",
    location: { latitude: 35.6875, longitude: 139.7625 },
  },
  created_at: "2026-08-02T15:02:01.000Z",
};

describe("toWalkHistoryItem", () => {
  it("WalkRead の全フィールドを写す", () => {
    const item = toWalkHistoryItem(READ, NOW);

    expect(item.id).toBe("walk-1");
    expect(item.startedAt).toBe(READ.started_at);
    expect(item.destinationName).toBe("緑町公園");
    expect(item.distanceKm).toBe(2.1);
    // 1920秒 → 32分
    expect(item.durationLabel).toBe("32分");
  });

  it("目的地名が空白のみなら「目的地」にフォールバックする", () => {
    const item = toWalkHistoryItem({ ...READ, destination: { ...READ.destination, name: "  " } });
    expect(item.destinationName).toBe("目的地");
  });

  it("started_at が不正なら日時不明・空文字になる", () => {
    const item = toWalkHistoryItem({ ...READ, started_at: "invalid" });
    expect(item.dateLabel).toBe("日時不明");
    expect(item.timeLabel).toBe("");
  });

  it("duration_seconds の秒→分は四捨五入される（95秒 → 2分）", () => {
    const item = toWalkHistoryItem({ ...READ, duration_seconds: 95 });
    expect(item.durationLabel).toBe("2分");
  });
});

describe("toWalkHistoryItems", () => {
  it("複数件を順序どおりに整形する", () => {
    const second: WalkRead = { ...READ, id: "walk-2" };
    const items = toWalkHistoryItems([READ, second], NOW);
    expect(items.map((item) => item.id)).toEqual(["walk-1", "walk-2"]);
  });
});

describe("dedupeWalkHistoryItems", () => {
  const ITEM_A: WalkHistoryItem = {
    id: "a",
    startedAt: "2026-08-02T14:30:00.000Z",
    dateLabel: "8月2日(日)",
    timeLabel: "14:30",
    destinationName: "緑町公園",
    durationLabel: "32分",
    distanceKm: 2.1,
  };
  const ITEM_A_DUPLICATE: WalkHistoryItem = { ...ITEM_A, distanceKm: 9.9 };
  const ITEM_B: WalkHistoryItem = { ...ITEM_A, id: "b" };

  it("同一idを先勝ちで1件にする", () => {
    const result = dedupeWalkHistoryItems([ITEM_A, ITEM_A_DUPLICATE]);
    expect(result).toEqual([ITEM_A]);
  });

  it("順序を保つ", () => {
    const result = dedupeWalkHistoryItems([ITEM_A, ITEM_B, ITEM_A_DUPLICATE]);
    expect(result.map((item) => item.id)).toEqual(["a", "b"]);
  });

  it("空配列は空配列", () => {
    expect(dedupeWalkHistoryItems([])).toEqual([]);
  });
});

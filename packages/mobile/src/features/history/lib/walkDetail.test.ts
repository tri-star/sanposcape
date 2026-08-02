import { describe, expect, it } from "vitest";

import type { WalkDetailRead } from "@/api/generated/model";
import { toWalkDetail } from "@/features/history/lib/walkDetail";

const NOW = new Date("2026-08-10T00:00:00.000Z");

const READ: WalkDetailRead = {
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
  track: [
    { latitude: 35.681236, longitude: 139.767125 },
    { latitude: 35.6875, longitude: 139.7625 },
  ],
};

describe("toWalkDetail", () => {
  it("WalkDetailRead を WalkDetail に写す", () => {
    const detail = toWalkDetail(READ, NOW);

    expect(detail.id).toBe("walk-1");
    expect(detail.destinationName).toBe("緑町公園");
    expect(detail.destination).toEqual({ latitude: 35.6875, longitude: 139.7625 });
    expect(detail.distanceKm).toBe(2.1);
    expect(detail.elapsedLabel).toBe("00:32:00");
    expect(detail.track).toEqual(READ.track);
  });

  it("無効座標を含む track は除去される", () => {
    const detail = toWalkDetail({
      ...READ,
      track: [
        { latitude: 35.681236, longitude: 139.767125 },
        { latitude: Number.NaN, longitude: 139.77 },
        { latitude: 91, longitude: 139.77 },
        { latitude: 35.6875, longitude: 139.7625 },
      ],
    });

    expect(detail.track).toEqual([
      { latitude: 35.681236, longitude: 139.767125 },
      { latitude: 35.6875, longitude: 139.7625 },
    ]);
  });

  it("track が全滅でも例外を投げず空配列になる", () => {
    const detail = toWalkDetail({
      ...READ,
      track: [{ latitude: Number.NaN, longitude: Number.NaN }],
    });
    expect(detail.track).toEqual([]);
  });

  it("duration_seconds が負値でも formatClock が throw しない", () => {
    expect(() => toWalkDetail({ ...READ, duration_seconds: -10 })).not.toThrow();
    expect(toWalkDetail({ ...READ, duration_seconds: -10 }).elapsedLabel).toBe("00:00:00");
  });

  it("started_at/ended_at の片方がパース失敗なら timeRangeLabel は空文字", () => {
    const detail = toWalkDetail({ ...READ, ended_at: "invalid" });
    expect(detail.timeRangeLabel).toBe("");
  });

  it("目的地名が空白のみなら「目的地」にフォールバックする", () => {
    const detail = toWalkDetail({ ...READ, destination: { ...READ.destination, name: "  " } });
    expect(detail.destinationName).toBe("目的地");
  });
});

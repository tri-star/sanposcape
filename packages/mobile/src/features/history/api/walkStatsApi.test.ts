import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  getGetWalkStatsWalksStatsGetMockHandler,
  getListWalksWalksGetMockHandler,
} from "@/api/generated/endpoints/walks/walks.msw";
import type { WalkListRead, WalkStatsRead } from "@/api/generated/model";
import { fetchWalkStats } from "@/features/history/api/walkStatsApi";
import { server } from "@/test/setup";

const STATS_RESPONSE: WalkStatsRead = {
  timezone: "Asia/Tokyo",
  generated_at: "2026-08-09T05:00:00+00:00",
  today: {
    date: "2026-08-09",
    walk_count: 1,
    duration_seconds: 1800,
    distance_meters: 4368,
  },
  streak_days: 12,
  week: {
    start_date: "2026-08-03",
    end_date: "2026-08-09",
    total_walk_count: 7,
    total_duration_seconds: 16440,
    total_distance_meters: 22700,
    buckets: [
      {
        start_date: "2026-08-03",
        end_date: "2026-08-03",
        walk_count: 2,
        duration_seconds: 1920,
        distance_meters: 2143,
        is_current: false,
      },
      {
        start_date: "2026-08-04",
        end_date: "2026-08-04",
        walk_count: 0,
        duration_seconds: 0,
        distance_meters: 0,
        is_current: false,
      },
      {
        start_date: "2026-08-05",
        end_date: "2026-08-05",
        walk_count: 1,
        duration_seconds: 2400,
        distance_meters: 3200,
        is_current: false,
      },
      {
        start_date: "2026-08-06",
        end_date: "2026-08-06",
        walk_count: 1,
        duration_seconds: 1200,
        distance_meters: 1600,
        is_current: false,
      },
      {
        start_date: "2026-08-07",
        end_date: "2026-08-07",
        walk_count: 1,
        duration_seconds: 3000,
        distance_meters: 4000,
        is_current: false,
      },
      {
        start_date: "2026-08-08",
        end_date: "2026-08-08",
        walk_count: 1,
        duration_seconds: 4320,
        distance_meters: 5389,
        is_current: false,
      },
      {
        start_date: "2026-08-09",
        end_date: "2026-08-09",
        walk_count: 1,
        duration_seconds: 1800,
        distance_meters: 4368,
        is_current: true,
      },
    ],
  },
  month: {
    start_date: "2026-07-13",
    end_date: "2026-08-09",
    total_walk_count: 21,
    total_duration_seconds: 53100,
    total_distance_meters: 73500,
    buckets: [
      {
        start_date: "2026-07-13",
        end_date: "2026-07-19",
        walk_count: 5,
        duration_seconds: 11100,
        distance_meters: 18500,
        is_current: false,
      },
      {
        start_date: "2026-07-20",
        end_date: "2026-07-26",
        walk_count: 5,
        duration_seconds: 14400,
        distance_meters: 19800,
        is_current: false,
      },
      {
        start_date: "2026-07-27",
        end_date: "2026-08-02",
        walk_count: 4,
        duration_seconds: 9720,
        distance_meters: 12500,
        is_current: false,
      },
      {
        start_date: "2026-08-03",
        end_date: "2026-08-09",
        walk_count: 7,
        duration_seconds: 16440,
        distance_meters: 22700,
        is_current: true,
      },
    ],
  },
};

const LIST_RESPONSE: WalkListRead = {
  items: [],
  next_cursor: null,
};

describe("fetchWalkStats", () => {
  it("200で WalkStatsRead がそのまま返る", async () => {
    server.use(getGetWalkStatsWalksStatsGetMockHandler(STATS_RESPONSE));

    const result = await fetchWalkStats();

    expect(result).toEqual(STATS_RESPONSE);
  });

  it.each([401, 422, 500])("%d で ApiError が throw される", async (status) => {
    server.use(http.get("*/walks/stats", () => new HttpResponse(null, { status })));

    try {
      await fetchWalkStats();
      expect.unreachable("throw されるはず");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).status).toBe(status);
    }
  });

  it("401のとき呼び出し回数は1", async () => {
    let callCount = 0;
    server.use(
      http.get("*/walks/stats", () => {
        callCount += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await expect(fetchWalkStats()).rejects.toThrow(ApiError);
    expect(callCount).toBe(1);
  });

  it("一覧用ハンドラ（*/walks）と併用しても取り違えない", async () => {
    server.use(
      getListWalksWalksGetMockHandler(LIST_RESPONSE),
      getGetWalkStatsWalksStatsGetMockHandler(STATS_RESPONSE),
    );

    const stats = await fetchWalkStats();

    expect(stats).toEqual(STATS_RESPONSE);
  });
});

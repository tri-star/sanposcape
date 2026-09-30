import { describe, expect, it } from "vitest";

import {
  LOCATION_REFRESH_MIN_INTERVAL_MS,
  shouldSkipSilentRefresh,
} from "@/lib/locationRefreshPolicy";

describe("shouldSkipSilentRefresh", () => {
  it("一度も取得できていなければ省かない", () => {
    expect(shouldSkipSilentRefresh({ lastFetchedAt: null, now: 1_000_000 })).toBe(false);
  });

  it("猶予時間内なら省く", () => {
    expect(shouldSkipSilentRefresh({ lastFetchedAt: 1_000, now: 1_000 + 1 })).toBe(true);
    expect(
      shouldSkipSilentRefresh({
        lastFetchedAt: 1_000,
        now: 1_000 + LOCATION_REFRESH_MIN_INTERVAL_MS - 1,
      }),
    ).toBe(true);
  });

  it("猶予時間ちょうど以降は省かない", () => {
    expect(
      shouldSkipSilentRefresh({
        lastFetchedAt: 1_000,
        now: 1_000 + LOCATION_REFRESH_MIN_INTERVAL_MS,
      }),
    ).toBe(false);
  });

  it("時計が巻き戻っていたら省かない", () => {
    expect(shouldSkipSilentRefresh({ lastFetchedAt: 5_000, now: 1_000 })).toBe(false);
  });

  it("猶予時間を上書きできる", () => {
    expect(shouldSkipSilentRefresh({ lastFetchedAt: 0, now: 500, minIntervalMs: 1_000 })).toBe(
      true,
    );
  });
});

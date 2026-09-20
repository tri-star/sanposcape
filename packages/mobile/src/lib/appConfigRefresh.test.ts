import { describe, expect, it } from "vitest";

import {
  APP_CONFIG_MIN_REFRESH_INTERVAL_MS,
  shouldRefreshOnForeground,
} from "@/lib/appConfigRefresh";

describe("shouldRefreshOnForeground", () => {
  it("background→active かつ 60秒以上経過なら true", () => {
    expect(
      shouldRefreshOnForeground({
        previousState: "background",
        nextState: "active",
        dataUpdatedAt: 0,
        nowMs: APP_CONFIG_MIN_REFRESH_INTERVAL_MS,
      }),
    ).toBe(true);
  });

  it("background→active でも 60秒未満なら false", () => {
    expect(
      shouldRefreshOnForeground({
        previousState: "background",
        nextState: "active",
        dataUpdatedAt: 1_000,
        nowMs: 1_000 + APP_CONFIG_MIN_REFRESH_INTERVAL_MS - 1,
      }),
    ).toBe(false);
  });

  it("dataUpdatedAt: 0（未取得）は常に true", () => {
    expect(
      shouldRefreshOnForeground({
        previousState: "background",
        nextState: "active",
        dataUpdatedAt: 0,
        nowMs: 0,
      }),
    ).toBe(true);
  });

  it("active→active は false（フォアグラウンド復帰ではない）", () => {
    expect(
      shouldRefreshOnForeground({
        previousState: "active",
        nextState: "active",
        dataUpdatedAt: 0,
        nowMs: 1_000_000,
      }),
    ).toBe(false);
  });

  it("active→background は false（復帰ではない）", () => {
    expect(
      shouldRefreshOnForeground({
        previousState: "active",
        nextState: "background",
        dataUpdatedAt: 0,
        nowMs: 1_000_000,
      }),
    ).toBe(false);
  });

  it("inactive→active は true 判定対象になる（60秒経過済みなら true）", () => {
    expect(
      shouldRefreshOnForeground({
        previousState: "inactive",
        nextState: "active",
        dataUpdatedAt: 0,
        nowMs: APP_CONFIG_MIN_REFRESH_INTERVAL_MS,
      }),
    ).toBe(true);
  });

  it("minIntervalMs の上書きが効く", () => {
    expect(
      shouldRefreshOnForeground({
        previousState: "background",
        nextState: "active",
        dataUpdatedAt: 1_000,
        nowMs: 1_500,
        minIntervalMs: 500,
      }),
    ).toBe(true);

    expect(
      shouldRefreshOnForeground({
        previousState: "background",
        nextState: "active",
        dataUpdatedAt: 1_000,
        nowMs: 1_400,
        minIntervalMs: 500,
      }),
    ).toBe(false);
  });
});

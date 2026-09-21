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
        errorUpdatedAt: 0,
        isFetching: false,
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
        errorUpdatedAt: 0,
        isFetching: false,
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
        errorUpdatedAt: 0,
        isFetching: false,
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
        errorUpdatedAt: 0,
        isFetching: false,
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
        errorUpdatedAt: 0,
        isFetching: false,
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
        errorUpdatedAt: 0,
        isFetching: false,
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
        errorUpdatedAt: 0,
        isFetching: false,
        nowMs: 1_500,
        minIntervalMs: 500,
      }),
    ).toBe(true);

    expect(
      shouldRefreshOnForeground({
        previousState: "background",
        nextState: "active",
        dataUpdatedAt: 1_000,
        errorUpdatedAt: 0,
        isFetching: false,
        nowMs: 1_400,
        minIntervalMs: 500,
      }),
    ).toBe(false);
  });

  it("初回取得が失敗した直後（dataUpdatedAt=0 / errorUpdatedAt=now）に復帰しても false", () => {
    expect(
      shouldRefreshOnForeground({
        previousState: "background",
        nextState: "active",
        dataUpdatedAt: 0,
        errorUpdatedAt: 1_000,
        isFetching: false,
        nowMs: 1_000,
      }),
    ).toBe(false);
  });

  it("失敗から60秒未満での復帰は false", () => {
    expect(
      shouldRefreshOnForeground({
        previousState: "background",
        nextState: "active",
        dataUpdatedAt: 0,
        errorUpdatedAt: 1_000,
        isFetching: false,
        nowMs: 1_000 + APP_CONFIG_MIN_REFRESH_INTERVAL_MS - 1,
      }),
    ).toBe(false);
  });

  it("失敗から60秒ちょうどでの復帰は true", () => {
    expect(
      shouldRefreshOnForeground({
        previousState: "background",
        nextState: "active",
        dataUpdatedAt: 0,
        errorUpdatedAt: 1_000,
        isFetching: false,
        nowMs: 1_000 + APP_CONFIG_MIN_REFRESH_INTERVAL_MS,
      }),
    ).toBe(true);
  });

  it("失敗から60秒以上経過しての復帰は true", () => {
    expect(
      shouldRefreshOnForeground({
        previousState: "background",
        nextState: "active",
        dataUpdatedAt: 0,
        errorUpdatedAt: 1_000,
        isFetching: false,
        nowMs: 1_000 + APP_CONFIG_MIN_REFRESH_INTERVAL_MS + 1,
      }),
    ).toBe(true);
  });

  it("実行中（isFetching=true）での復帰は、間隔条件を満たしていても false", () => {
    expect(
      shouldRefreshOnForeground({
        previousState: "background",
        nextState: "active",
        dataUpdatedAt: 0,
        errorUpdatedAt: 0,
        isFetching: true,
        nowMs: APP_CONFIG_MIN_REFRESH_INTERVAL_MS,
      }),
    ).toBe(false);
  });

  it("dataUpdatedAt より errorUpdatedAt が新しい場合、後者を最後に試行した時刻として使う", () => {
    // 成功(1_000) の後に失敗(2_000) している = 直近の試行は失敗。
    // 失敗時刻からまだ60秒経っていないので false になるはず。
    expect(
      shouldRefreshOnForeground({
        previousState: "background",
        nextState: "active",
        dataUpdatedAt: 1_000,
        errorUpdatedAt: 2_000,
        isFetching: false,
        nowMs: 2_000 + APP_CONFIG_MIN_REFRESH_INTERVAL_MS - 1,
      }),
    ).toBe(false);
  });

  it("dataUpdatedAt より errorUpdatedAt が古い場合、前者（成功時刻）を基準にする", () => {
    // 失敗(1_000) の後に成功(2_000) している = 直近の試行は成功。
    // 成功時刻から60秒以上経っていれば true になるはず。
    expect(
      shouldRefreshOnForeground({
        previousState: "background",
        nextState: "active",
        dataUpdatedAt: 2_000,
        errorUpdatedAt: 1_000,
        isFetching: false,
        nowMs: 2_000 + APP_CONFIG_MIN_REFRESH_INTERVAL_MS,
      }),
    ).toBe(true);
  });
});

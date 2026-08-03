import { describe, expect, it } from "vitest";

import {
  WALK_HISTORY_PAGE_SIZE,
  buildWalkListParams,
  normalizeWalkHistoryLimit,
} from "@/features/history/lib/walkHistoryParams";

describe("normalizeWalkHistoryLimit", () => {
  it("同じ実リクエストになる値を同じ limit に正規化する", () => {
    expect(normalizeWalkHistoryLimit(100)).toBe(50);
    expect(normalizeWalkHistoryLimit(50)).toBe(50);
  });

  it("未指定と非有限値を既定値に正規化する", () => {
    expect(normalizeWalkHistoryLimit(undefined)).toBe(WALK_HISTORY_PAGE_SIZE);
    expect(normalizeWalkHistoryLimit(Number.NaN)).toBe(WALK_HISTORY_PAGE_SIZE);
  });
});

describe("buildWalkListParams", () => {
  it("limit 未指定なら既定の20になる", () => {
    expect(buildWalkListParams({}).limit).toBe(WALK_HISTORY_PAGE_SIZE);
  });

  it("limit が下限未満(0)なら1にクランプする", () => {
    expect(buildWalkListParams({ limit: 0 }).limit).toBe(1);
  });

  it("limit が上限超過(100)なら50にクランプする", () => {
    expect(buildWalkListParams({ limit: 100 }).limit).toBe(50);
  });

  it("limit が小数なら整数に切り捨てる", () => {
    expect(buildWalkListParams({ limit: 12.9 }).limit).toBe(12);
  });

  it("limit が NaN なら既定値になる", () => {
    expect(buildWalkListParams({ limit: Number.NaN }).limit).toBe(WALK_HISTORY_PAGE_SIZE);
  });

  it("cursor が null ならキー自体が無い（?cursor=null 送信の回帰防止）", () => {
    const params = buildWalkListParams({ cursor: null });
    expect("cursor" in params).toBe(false);
  });

  it("cursor が undefined ならキー自体が無い", () => {
    const params = buildWalkListParams({ cursor: undefined });
    expect("cursor" in params).toBe(false);
  });

  it("cursor が空文字ならキー自体が無い", () => {
    const params = buildWalkListParams({ cursor: "" });
    expect("cursor" in params).toBe(false);
  });

  it("cursor が非空文字なら値が入る", () => {
    const params = buildWalkListParams({ cursor: "next-page-token" });
    expect(params.cursor).toBe("next-page-token");
  });
});

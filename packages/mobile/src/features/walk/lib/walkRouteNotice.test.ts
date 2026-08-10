import { describe, expect, it } from "vitest";

import { walkRouteNoticeKind } from "@/features/walk/lib/walkRouteNotice";

describe("walkRouteNoticeKind", () => {
  it('recalcStatus === "recalculating" は他条件より優先されて "recalculating"（AC1: 再計算中の表示）', () => {
    expect(
      walkRouteNoticeKind({
        hasRoute: false,
        baseErrorCode: "network",
        recalcStatus: "recalculating",
        canRecalculate: false,
      }),
    ).toBe("recalculating");
  });

  it('recalcStatus === "failed" → "recalc_failed"（AC3: 失敗表示 + 再試行）', () => {
    expect(
      walkRouteNoticeKind({
        hasRoute: true,
        baseErrorCode: null,
        recalcStatus: "failed",
        canRecalculate: true,
      }),
    ).toBe("recalc_failed");
  });

  it('hasRoute: false + baseErrorCode !== null → "base_error"', () => {
    expect(
      walkRouteNoticeKind({
        hasRoute: false,
        baseErrorCode: "unknown",
        recalcStatus: "idle",
        canRecalculate: true,
      }),
    ).toBe("base_error");
  });

  it('hasRoute: true + baseErrorCode !== null + recalcStatus: "idle" → "none"（再計算で表示できているのに初期エラーを出さない）', () => {
    expect(
      walkRouteNoticeKind({
        hasRoute: true,
        baseErrorCode: "unknown",
        recalcStatus: "idle",
        canRecalculate: true,
      }),
    ).toBe("none");
  });

  it('hasRoute: true + canRecalculate: false → "recalc_unavailable"（AC2）', () => {
    expect(
      walkRouteNoticeKind({
        hasRoute: true,
        baseErrorCode: null,
        recalcStatus: "idle",
        canRecalculate: false,
      }),
    ).toBe("recalc_unavailable");
  });

  it('hasRoute: false + canRecalculate: false + baseErrorCode: null → "none"（初期ロード中）', () => {
    expect(
      walkRouteNoticeKind({
        hasRoute: false,
        baseErrorCode: null,
        recalcStatus: "idle",
        canRecalculate: false,
      }),
    ).toBe("none");
  });

  it('すべて正常 → "none"', () => {
    expect(
      walkRouteNoticeKind({
        hasRoute: true,
        baseErrorCode: null,
        recalcStatus: "idle",
        canRecalculate: true,
      }),
    ).toBe("none");
  });
});

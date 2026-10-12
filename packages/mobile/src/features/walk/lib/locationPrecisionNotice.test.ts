import { describe, expect, it } from "vitest";

import {
  approximateLocationNoticeMessage,
  shouldShowApproximateLocationNotice,
} from "@/features/walk/lib/locationPrecisionNotice";

describe("shouldShowApproximateLocationNotice", () => {
  it("approximate のときだけ true", () => {
    expect(shouldShowApproximateLocationNotice("approximate")).toBe(true);
    expect(shouldShowApproximateLocationNotice("precise")).toBe(false);
    expect(shouldShowApproximateLocationNotice(null)).toBe(false);
  });
});

describe("approximateLocationNoticeMessage", () => {
  it("2つの文脈で非空・異なり、「正確な位置情報」を含む", () => {
    const explore = approximateLocationNoticeMessage("explore");
    const tracking = approximateLocationNoticeMessage("tracking");
    expect(explore).not.toBe(tracking);
    expect(explore).toContain("正確な位置情報");
    expect(tracking).toContain("正確な位置情報");
  });

  it("許可やオンを迫る「してください」を含まない（誘導しない文言の回帰防止）", () => {
    for (const context of ["explore", "tracking"] as const) {
      const message = approximateLocationNoticeMessage(context);
      expect(message).not.toContain("してください");
      expect(message).not.toContain("許可");
    }
  });

  it("tracking は記録が続くことを伝える", () => {
    expect(approximateLocationNoticeMessage("tracking")).toContain("記録は続け");
  });
});

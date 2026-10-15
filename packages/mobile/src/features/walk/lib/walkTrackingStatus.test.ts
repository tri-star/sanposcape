import { describe, expect, it } from "vitest";

import { type WalkTrackingStatus, walkTrackingBadge } from "@/features/walk/lib/walkTrackingStatus";

const ALL_STATUSES: WalkTrackingStatus[] = ["idle", "acquiring", "tracking", "error"];

describe("walkTrackingBadge", () => {
  it("4状態すべてに label/tone がある", () => {
    for (const status of ALL_STATUSES) {
      const badge = walkTrackingBadge(status);
      expect(badge.label.length).toBeGreaterThan(0);
      expect(badge.tone.length).toBeGreaterThan(0);
    }
  });

  it("tracking は success、error は danger", () => {
    expect(walkTrackingBadge("tracking").tone).toBe("success");
    expect(walkTrackingBadge("error").tone).toBe("danger");
  });

  it("tracking + approximate は「位置が大まか」の warning", () => {
    expect(walkTrackingBadge("tracking", { approximate: true })).toEqual({
      label: "位置が大まか",
      tone: "warning",
    });
  });

  it("tracking で approximate が省略・false なら従来どおり success", () => {
    expect(walkTrackingBadge("tracking").tone).toBe("success");
    expect(walkTrackingBadge("tracking", {}).label).toBe("GPS良好");
    expect(walkTrackingBadge("tracking", { approximate: false }).label).toBe("GPS良好");
  });

  it("idle・acquiring・error は approximate の影響を受けない", () => {
    for (const status of ["idle", "acquiring", "error"] as const) {
      expect(walkTrackingBadge(status, { approximate: true })).toEqual(walkTrackingBadge(status));
    }
  });
});

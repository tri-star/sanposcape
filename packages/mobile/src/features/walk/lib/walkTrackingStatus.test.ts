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
});

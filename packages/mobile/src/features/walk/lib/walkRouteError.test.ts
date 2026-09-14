import { describe, expect, it } from "vitest";

import type { ExploreErrorCode } from "@/features/walk/lib/exploreError";
import { walkRouteErrorMessage } from "@/features/walk/lib/walkRouteError";

const ALL_CODES: ExploreErrorCode[] = [
  "unauthorized",
  "too_large",
  "invalid_request",
  "rate_limited",
  "provider_unavailable",
  "network",
  "unknown",
];

describe("walkRouteErrorMessage", () => {
  it("全 ExploreErrorCode に文言がある", () => {
    for (const code of ALL_CODES) {
      expect(typeof walkRouteErrorMessage(code)).toBe("string");
    }
  });

  it("文言が空文字でない", () => {
    for (const code of ALL_CODES) {
      expect(walkRouteErrorMessage(code).length).toBeGreaterThan(0);
    }
  });
});

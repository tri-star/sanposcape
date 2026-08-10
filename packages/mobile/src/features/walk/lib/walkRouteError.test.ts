import { describe, expect, it } from "vitest";

import type { ExploreErrorCode } from "@/features/walk/lib/exploreError";
import {
  walkRouteErrorMessage,
  walkRouteRecalcErrorMessage,
} from "@/features/walk/lib/walkRouteError";

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

describe("walkRouteRecalcErrorMessage", () => {
  it("全 ExploreErrorCode について非空文字列を返す", () => {
    for (const code of ALL_CODES) {
      const message = walkRouteRecalcErrorMessage(code);
      expect(typeof message).toBe("string");
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it('network の文言に、既存 walkRouteErrorMessage("network") の文言が含まれる（分類の再利用が壊れていないこと）', () => {
    expect(walkRouteRecalcErrorMessage("network")).toContain(walkRouteErrorMessage("network"));
  });
});

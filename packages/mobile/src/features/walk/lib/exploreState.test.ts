import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import { classifyExploreError, shouldKeepSelectedSpot } from "@/features/walk/lib/exploreState";

describe("explore state helpers", () => {
  it.each([
    [new ApiError(401), "auth"],
    [new ApiError(429), "rate-limit"],
    [new ApiError(503), "unavailable"],
    [new TypeError("network"), "network"],
    [new Error("other"), "unknown"],
  ] as const)("classifies %s", (error, expected) => {
    expect(classifyExploreError(error)).toBe(expected);
  });

  it("drops a selected spot when new candidates no longer contain it", () => {
    expect(shouldKeepSelectedSpot("a", ["a", "b"])).toBe(true);
    expect(shouldKeepSelectedSpot("a", ["b"])).toBe(false);
    expect(shouldKeepSelectedSpot(null, ["a"])).toBe(false);
  });
});

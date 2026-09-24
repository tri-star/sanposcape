import { describe, expect, it } from "vitest";

import { resolveFeatureGateDecision } from "@/lib/featureGate";

describe("resolveFeatureGateDecision", () => {
  it("enabled: true なら status に関わらず enabled", () => {
    expect(resolveFeatureGateDecision({ status: "loading", enabled: true })).toBe("enabled");
    expect(resolveFeatureGateDecision({ status: "ready", enabled: true })).toBe("enabled");
    expect(resolveFeatureGateDecision({ status: "unavailable", enabled: true })).toBe("enabled");
  });

  it("loading + false は pending", () => {
    expect(resolveFeatureGateDecision({ status: "loading", enabled: false })).toBe("pending");
  });

  it("ready + false は disabled", () => {
    expect(resolveFeatureGateDecision({ status: "ready", enabled: false })).toBe("disabled");
  });

  it("unavailable + false は disabled", () => {
    expect(resolveFeatureGateDecision({ status: "unavailable", enabled: false })).toBe("disabled");
  });
});

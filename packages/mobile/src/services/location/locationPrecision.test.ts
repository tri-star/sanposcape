import { describe, expect, it } from "vitest";

import { toLocationPrecision } from "@/services/location/locationPrecision";

describe("toLocationPrecision", () => {
  it("権限が無ければ null（ios が reduced でも null）", () => {
    expect(toLocationPrecision({ granted: false })).toBeNull();
    expect(toLocationPrecision({ granted: false, ios: { accuracy: "reduced" } })).toBeNull();
  });

  it("iOS の reduced は approximate", () => {
    expect(toLocationPrecision({ granted: true, ios: { accuracy: "reduced" } })).toBe(
      "approximate",
    );
  });

  it("iOS の full は precise", () => {
    expect(toLocationPrecision({ granted: true, ios: { accuracy: "full" } })).toBe("precise");
  });

  it("Android の coarse は approximate", () => {
    expect(toLocationPrecision({ granted: true, android: { accuracy: "coarse" } })).toBe(
      "approximate",
    );
  });

  it("Android の fine は precise", () => {
    expect(toLocationPrecision({ granted: true, android: { accuracy: "fine" } })).toBe("precise");
  });

  it("ios・android とも無ければ precise", () => {
    expect(toLocationPrecision({ granted: true })).toBe("precise");
  });

  it("想定外の値は precise（案内を出さない側に倒す）", () => {
    expect(toLocationPrecision({ granted: true, ios: { accuracy: "unknown" } })).toBe("precise");
    expect(toLocationPrecision({ granted: true, android: { accuracy: "unknown" } })).toBe(
      "precise",
    );
  });

  it("ios / android が null でも落ちない", () => {
    expect(toLocationPrecision({ granted: true, ios: null, android: null })).toBe("precise");
  });
});

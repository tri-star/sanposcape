import { describe, expect, it } from "vitest";

import { toKilometers } from "@/lib/units";

describe("toKilometers", () => {
  it("1600m → 1.6km", () => {
    expect(toKilometers(1600)).toBe(1.6);
  });

  it("負値・NaNは0に丸まる", () => {
    expect(toKilometers(-100)).toBe(0);
    expect(toKilometers(NaN)).toBe(0);
  });
});

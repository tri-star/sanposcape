import { describe, expect, it } from "vitest";

import { buildPinAddressRequest } from "@/features/pin/lib/pinAddressRequest";

describe("buildPinAddressRequest", () => {
  it("座標を保存するピンと同じ小数6桁に丸めて送る", () => {
    expect(buildPinAddressRequest({ latitude: 35.68123456, longitude: 139.76712349 })).toEqual({
      location: { latitude: 35.681235, longitude: 139.767123 },
    });
  });

  it("座標が不正なら null", () => {
    expect(buildPinAddressRequest({ latitude: 91, longitude: 0 })).toBeNull();
    expect(buildPinAddressRequest({ latitude: Number.NaN, longitude: 0 })).toBeNull();
  });
});

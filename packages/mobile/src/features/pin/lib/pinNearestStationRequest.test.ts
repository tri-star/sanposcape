import { describe, expect, it } from "vitest";

import { buildPinNearestStationRequest } from "@/features/pin/lib/pinNearestStationRequest";

describe("buildPinNearestStationRequest", () => {
  it("座標を保存するピンと同じ小数6桁に丸めて送る", () => {
    expect(
      buildPinNearestStationRequest({ latitude: 35.68123456, longitude: 139.76712349 }),
    ).toEqual({ location: { latitude: 35.681235, longitude: 139.767123 } });
  });

  it("座標が不正なら null（送らない）", () => {
    expect(buildPinNearestStationRequest({ latitude: 91, longitude: 0 })).toBeNull();
  });
});

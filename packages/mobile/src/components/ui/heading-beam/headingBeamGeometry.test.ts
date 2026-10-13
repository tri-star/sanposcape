import { describe, expect, it } from "vitest";

import {
  HEADING_BEAM_RADIUS_PX,
  HEADING_BEAM_SPREAD_DEGREES,
  headingBeamPolygon,
  headingBeamRadiusMeters,
} from "@/components/ui/heading-beam/headingBeamGeometry";

const TOKYO = { latitude: 35.681236, longitude: 139.767125 };

/** 等距円筒近似での2点の距離（m）と方位（度）。テストの検算用。 */
function measure(from: typeof TOKYO, to: typeof TOKYO) {
  const R = 6_371_008.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const north = toRad(to.latitude - from.latitude) * R;
  const east = toRad(to.longitude - from.longitude) * Math.cos(toRad(from.latitude)) * R;
  const bearing = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
  return { distance: Math.hypot(north, east), bearing };
}

describe("headingBeamRadiusMeters", () => {
  it("1px あたりの距離 × 画面上の半径を返す", () => {
    // 緯度の幅 0.01 度（約 1113m）を 500px で表示 → 約 2.23m/px
    const radius = headingBeamRadiusMeters({ latitudeDelta: 0.01, mapHeightPx: 500 });
    expect(radius).toBeCloseTo(((0.01 * 111_320) / 500) * HEADING_BEAM_RADIUS_PX, 5);
  });

  it("下限・上限で丸める", () => {
    expect(headingBeamRadiusMeters({ latitudeDelta: 0.000001, mapHeightPx: 500 })).toBe(3);
    expect(headingBeamRadiusMeters({ latitudeDelta: 10, mapHeightPx: 300 })).toBe(3000);
  });

  it("幅・高さが不正なら null", () => {
    expect(headingBeamRadiusMeters({ latitudeDelta: 0, mapHeightPx: 500 })).toBeNull();
    expect(headingBeamRadiusMeters({ latitudeDelta: 0.01, mapHeightPx: 0 })).toBeNull();
    expect(headingBeamRadiusMeters({ latitudeDelta: Number.NaN, mapHeightPx: 500 })).toBeNull();
  });
});

describe("headingBeamPolygon", () => {
  it("先頭が中心で、円弧の点はすべて半径の距離にある", () => {
    const points = headingBeamPolygon({ center: TOKYO, headingDegrees: 0, radiusMeters: 100 });
    expect(points[0]).toEqual(TOKYO);
    for (const point of points.slice(1)) {
      expect(measure(TOKYO, point).distance).toBeCloseTo(100, 0);
    }
  });

  it("円弧の両端が向きを中心に開きの半分ずつ離れる", () => {
    const heading = 90;
    const points = headingBeamPolygon({
      center: TOKYO,
      headingDegrees: heading,
      radiusMeters: 100,
    });
    const first = measure(TOKYO, points[1]!).bearing;
    const last = measure(TOKYO, points[points.length - 1]!).bearing;
    expect(first).toBeCloseTo(heading - HEADING_BEAM_SPREAD_DEGREES / 2, 1);
    expect(last).toBeCloseTo(heading + HEADING_BEAM_SPREAD_DEGREES / 2, 1);
  });

  it("北向きなら円弧は中心より北にある", () => {
    const points = headingBeamPolygon({ center: TOKYO, headingDegrees: 0, radiusMeters: 50 });
    for (const point of points.slice(1)) {
      expect(point.latitude).toBeGreaterThan(TOKYO.latitude);
    }
  });

  it("座標・方位・半径が不正なら空配列", () => {
    expect(
      headingBeamPolygon({
        center: { latitude: Number.NaN, longitude: 0 },
        headingDegrees: 0,
        radiusMeters: 10,
      }),
    ).toEqual([]);
    expect(
      headingBeamPolygon({ center: TOKYO, headingDegrees: Number.NaN, radiusMeters: 10 }),
    ).toEqual([]);
    expect(headingBeamPolygon({ center: TOKYO, headingDegrees: 0, radiusMeters: 0 })).toEqual([]);
  });
});

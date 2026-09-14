import { describe, expect, it } from "vitest";

import {
  walkRouteLegendItems,
  walkRouteLoopNote,
  walkRoutePolylineSegments,
} from "@/features/walk/lib/walkRouteLegs";
import type { WalkRoute } from "@/features/walk/types";

const OUTBOUND_PATH = [
  { latitude: 35.6812, longitude: 139.7671 },
  { latitude: 35.685, longitude: 139.765 },
  { latitude: 35.6875, longitude: 139.7625 },
];

const RETURN_PATH = [
  { latitude: 35.6875, longitude: 139.7625 },
  { latitude: 35.684, longitude: 139.769 },
  { latitude: 35.6812, longitude: 139.7671 },
];

function buildRoute(overrides: Partial<WalkRoute> = {}): WalkRoute {
  return {
    origin: { latitude: 35.6812, longitude: 139.7671 },
    destination: {
      placeId: "place-1",
      name: "緑町公園",
      location: { latitude: 35.6875, longitude: 139.7625 },
    },
    durationSeconds: 1500,
    distanceMeters: 2000,
    legs: [
      { kind: "outbound", durationSeconds: 700, distanceMeters: 900, path: OUTBOUND_PATH },
      { kind: "return", durationSeconds: 800, distanceMeters: 1100, path: RETURN_PATH },
    ],
    returnIsSamePath: false,
    bounds: {
      northEast: { latitude: 35.6875, longitude: 139.7671 },
      southWest: { latitude: 35.6812, longitude: 139.7625 },
    },
    ...overrides,
  };
}

describe("walkRoutePolylineSegments", () => {
  it("通常の周回では [return, outbound] の順で返す", () => {
    const route = buildRoute();
    const segments = walkRoutePolylineSegments(route);
    expect(segments.map((segment) => segment.kind)).toEqual(["return", "outbound"]);
    expect(segments[0]!.path).toEqual(RETURN_PATH);
    expect(segments[1]!.path).toEqual(OUTBOUND_PATH);
  });

  it("returnIsSamePath なら outbound 1本だけ", () => {
    const route = buildRoute({ returnIsSamePath: true });
    const segments = walkRoutePolylineSegments(route);
    expect(segments.map((segment) => segment.kind)).toEqual(["outbound"]);
  });

  it("復路の path が空なら outbound のみ", () => {
    const route = buildRoute({
      legs: [
        { kind: "outbound", durationSeconds: 700, distanceMeters: 900, path: OUTBOUND_PATH },
        { kind: "return", durationSeconds: 800, distanceMeters: 1100, path: [] },
      ],
    });
    const segments = walkRoutePolylineSegments(route);
    expect(segments.map((segment) => segment.kind)).toEqual(["outbound"]);
  });

  it("両方の path が空なら空配列", () => {
    const route = buildRoute({
      legs: [
        { kind: "outbound", durationSeconds: 700, distanceMeters: 900, path: [] },
        { kind: "return", durationSeconds: 800, distanceMeters: 1100, path: [] },
      ],
    });
    expect(walkRoutePolylineSegments(route)).toEqual([]);
  });

  it("returnIsSamePath でも outbound の path が空なら空配列", () => {
    const route = buildRoute({
      returnIsSamePath: true,
      legs: [
        { kind: "outbound", durationSeconds: 700, distanceMeters: 900, path: [] },
        { kind: "return", durationSeconds: 800, distanceMeters: 1100, path: [] },
      ],
    });
    expect(walkRoutePolylineSegments(route)).toEqual([]);
  });
});

describe("walkRouteLegendItems", () => {
  it("通常の周回では「行き」「帰り」の順", () => {
    const route = buildRoute();
    expect(walkRouteLegendItems(route)).toEqual([
      { kind: "outbound", label: "行き" },
      { kind: "return", label: "帰り" },
    ]);
  });

  it("returnIsSamePath なら「行き・帰り（同じ道）」1件", () => {
    const route = buildRoute({ returnIsSamePath: true });
    expect(walkRouteLegendItems(route)).toEqual([
      { kind: "outbound", label: "行き・帰り（同じ道）" },
    ]);
  });

  it("復路の path が空なら「行き」のみ", () => {
    const route = buildRoute({
      legs: [
        { kind: "outbound", durationSeconds: 700, distanceMeters: 900, path: OUTBOUND_PATH },
        { kind: "return", durationSeconds: 800, distanceMeters: 1100, path: [] },
      ],
    });
    expect(walkRouteLegendItems(route)).toEqual([{ kind: "outbound", label: "行き" }]);
  });

  it("両方 path が空なら空配列", () => {
    const route = buildRoute({
      legs: [
        { kind: "outbound", durationSeconds: 700, distanceMeters: 900, path: [] },
        { kind: "return", durationSeconds: 800, distanceMeters: 1100, path: [] },
      ],
    });
    expect(walkRouteLegendItems(route)).toEqual([]);
  });

  it.each([
    ["通常", buildRoute()],
    ["同じ道", buildRoute({ returnIsSamePath: true })],
    [
      "復路のpathが空",
      buildRoute({
        legs: [
          { kind: "outbound", durationSeconds: 700, distanceMeters: 900, path: OUTBOUND_PATH },
          { kind: "return", durationSeconds: 800, distanceMeters: 1100, path: [] },
        ],
      }),
    ],
    [
      "両方空",
      buildRoute({
        legs: [
          { kind: "outbound", durationSeconds: 700, distanceMeters: 900, path: [] },
          { kind: "return", durationSeconds: 800, distanceMeters: 1100, path: [] },
        ],
      }),
    ],
  ])("%s: legend の kind 集合が segments の kind 集合と一致する", (_label, route) => {
    const segmentKinds = new Set(walkRoutePolylineSegments(route).map((segment) => segment.kind));
    const legendKinds = new Set(walkRouteLegendItems(route).map((item) => item.kind));
    expect(legendKinds).toEqual(segmentKinds);
  });
});

describe("walkRouteLoopNote", () => {
  it("通常時は「行きと帰りで違う道を歩きます」", () => {
    expect(walkRouteLoopNote(buildRoute())).toBe("行きと帰りで違う道を歩きます");
  });

  it("returnIsSamePath のときは「帰りは同じ道を戻ります」", () => {
    expect(walkRouteLoopNote(buildRoute({ returnIsSamePath: true }))).toBe(
      "帰りは同じ道を戻ります",
    );
  });
});

import { describe, expect, it } from "vitest";

import { PHOTO_MAX_EDGE_PX, computeResizeTarget } from "@/services/photo/photoResize";

describe("computeResizeTarget", () => {
  it("横長（width > height）は width を指定する", () => {
    expect(computeResizeTarget(4032, 3024)).toEqual({ width: PHOTO_MAX_EDGE_PX });
  });

  it("縦長（height > width）は height を指定する", () => {
    expect(computeResizeTarget(3024, 4032)).toEqual({ height: PHOTO_MAX_EDGE_PX });
  });

  it("正方形（width === height）は width を指定する", () => {
    expect(computeResizeTarget(4000, 4000)).toEqual({ width: PHOTO_MAX_EDGE_PX });
  });

  it.each([
    ["長辺が上限未満", 1200, 800],
    ["長辺がちょうど上限", 2048, 1000],
  ])("%s は null（縮小不要）", (_label, width, height) => {
    expect(computeResizeTarget(width, height)).toBeNull();
  });

  it.each([
    ["幅が0", 0, 100],
    ["高さが負", 100, -1],
    ["NaN", Number.NaN, 100],
    ["Infinity", Number.POSITIVE_INFINITY, 100],
  ])("不正値（%s）は null", (_label, width, height) => {
    expect(computeResizeTarget(width, height)).toBeNull();
  });

  it("maxEdge を明示的に指定できる", () => {
    expect(computeResizeTarget(2000, 1000, 512)).toEqual({ width: 512 });
  });
});

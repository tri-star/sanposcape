import { describe, expect, it } from "vitest";

import {
  computeMapPinGeometry,
  DEFAULT_MAP_PIN_SIZE,
  mapPinMarkerPlacement,
} from "@/components/ui/map-pin/mapPinGeometry";

describe("computeMapPinGeometry", () => {
  it("size 30 の寸法とパスの両端", () => {
    const g = computeMapPinGeometry(30);
    expect(g.width).toBe(30);
    expect(g.height).toBe(44);
    expect(g.tip).toEqual({ x: 15, y: 42.75 });
    expect(g.path.startsWith("M 15 42.75")).toBe(true);
    expect(g.path.endsWith("Z")).toBe(true);
  });

  it.each([24, 30, 38, 42])("size %i: 先端が下端中央に来る", (size) => {
    const g = computeMapPinGeometry(size);
    expect(g.tip.x).toBe(g.width / 2);
    expect(g.tip.y + g.outlineWidth / 2).toBe(g.height);
  });

  it.each([24, 30, 38, 42])("size %i: シルエットが枠内に収まる", (size) => {
    const g = computeMapPinGeometry(size);
    const half = g.outlineWidth / 2;
    expect(g.head.cy - g.head.r - half).toBe(0);
    expect(g.head.cx - g.head.r - half).toBe(0);
    // 接点: path の "L x y" から取り出す
    const match = /L ([\d.]+) ([\d.]+)/.exec(g.path);
    expect(match).not.toBeNull();
    const x = Number(match![1]);
    const y = Number(match![2]);
    expect(x).toBeGreaterThanOrEqual(half);
    expect(x).toBeLessThanOrEqual(g.width - half);
    expect(y).toBeGreaterThan(g.head.cy);
    expect(y).toBeLessThan(g.tip.y);
  });

  it("頭の弧は大きい弧・時計回り", () => {
    expect(computeMapPinGeometry(30).path).toContain(" 0 1 1 ");
  });

  it("グリフが頭の中心に置かれる", () => {
    const g = computeMapPinGeometry(38);
    expect(g.glyph.left + g.glyph.size / 2).toBe(g.head.cx);
    expect(g.glyph.top + g.glyph.size / 2).toBe(g.head.cy);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, 0, -1, 11])(
    "不正な size %s は既定サイズ扱い",
    (size) => {
      expect(computeMapPinGeometry(size)).toEqual(computeMapPinGeometry(DEFAULT_MAP_PIN_SIZE));
    },
  );
});

describe("mapPinMarkerPlacement", () => {
  it.each([24, 30, 38, 42])(
    "size %i: anchor は下端中央、centerOffset は高さの半分だけ上",
    (size) => {
      const p = mapPinMarkerPlacement(size);
      expect(p.anchor).toEqual({ x: 0.5, y: 1 });
      expect(p.centerOffset).toEqual({ x: 0, y: -computeMapPinGeometry(size).height / 2 });
    },
  );
});

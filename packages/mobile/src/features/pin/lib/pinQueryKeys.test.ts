import { describe, expect, it } from "vitest";

import {
  PINS_QUERY_ROOT,
  pinDetailQueryKey,
  pinListQueryKey,
  pinPhotosQueryKey,
} from "@/features/pin/lib/pinQueryKeys";
import type { GeoBounds } from "@/features/pin/types";

const BOUNDS: GeoBounds = { south: 35.6, west: 139.7, north: 35.7, east: 139.8 };

describe("pinQueryKeys", () => {
  it("すべて PINS_QUERY_ROOT[0] で始まる", () => {
    expect(pinListQueryKey("map-1", BOUNDS)[0]).toBe(PINS_QUERY_ROOT[0]);
    expect(pinDetailQueryKey("pin-1")[0]).toBe(PINS_QUERY_ROOT[0]);
    expect(pinPhotosQueryKey("pin-1")[0]).toBe(PINS_QUERY_ROOT[0]);
  });

  it("同じ引数なら同じ構造のキーになる", () => {
    expect(pinListQueryKey("map-1", BOUNDS)).toEqual(pinListQueryKey("map-1", { ...BOUNDS }));
    expect(pinDetailQueryKey("pin-1")).toEqual(pinDetailQueryKey("pin-1"));
    expect(pinPhotosQueryKey("pin-1")).toEqual(pinPhotosQueryKey("pin-1"));
  });

  it("引数が異なれば異なる構造のキーになる", () => {
    expect(pinListQueryKey("map-1", BOUNDS)).not.toEqual(pinListQueryKey("map-2", BOUNDS));
    expect(pinDetailQueryKey("pin-1")).not.toEqual(pinDetailQueryKey("pin-2"));
  });
});

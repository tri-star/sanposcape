import { describe, expect, it } from "vitest";

import type { Spot } from "@/features/walk/data/types";
import { reachableSpots } from "@/features/walk/lib/reachableSpots";

const SPOTS: Spot[] = [
  { id: "s1", name: "緑町公園", category: "park", time: 20, dist: 1.3, x: 22, y: 20 },
  { id: "s2", name: "コンビニ ハーモニー", category: "konbini", time: 15, dist: 1.0, x: 54, y: 58 },
  { id: "s3", name: "さくら駅", category: "station", time: 40, dist: 2.6, x: 72, y: 22 },
];

describe("reachableSpots", () => {
  it("duration 以下のスポットのみ含む（境界を含む）", () => {
    const result = reachableSpots(SPOTS, 20, ["park", "konbini", "station"]);
    expect(result.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("duration 未満なら除外する", () => {
    const result = reachableSpots(SPOTS, 19, ["park", "konbini", "station"]);
    expect(result.map((s) => s.id)).toEqual(["s2"]);
  });

  it("表示カテゴリで絞り込む", () => {
    const result = reachableSpots(SPOTS, 100, ["park"]);
    expect(result.map((s) => s.id)).toEqual(["s1"]);
  });

  it("カテゴリが空なら常に空配列", () => {
    expect(reachableSpots(SPOTS, 999, [])).toEqual([]);
  });

  it("スポットが空なら空配列", () => {
    expect(reachableSpots([], 60, ["park"])).toEqual([]);
  });
});

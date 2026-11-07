import { describe, expect, it } from "vitest";

import {
  buildTagSummaries,
  filterTagSummariesByLabel,
  parseTagLabelParam,
  selectPinsWithTag,
  type SanpoMapPinGroup,
} from "@/features/pin/lib/tag/pinTagIndex";
import type { PinListEntry, SanpoMap } from "@/features/pin/types";

function makeMap(id: string, name: string): SanpoMap {
  return {
    id,
    name,
    isDefault: false,
    role: "owner",
    pinCount: null,
    icon: "pin",
    pinsVisible: true,
  };
}

function makePin(id: string, createdAt: string, labels: string[]): PinListEntry {
  return {
    id,
    name: id,
    tags: labels.map((label, i) => ({ id: `${id}-t${i}`, label, createdByUserId: "u1" })),
    coverPhoto: null,
    photoCount: 0,
    createdAt,
    visited: false,
    archived: false,
  };
}

const mapA = makeMap("a", "散歩");
const mapB = makeMap("b", "カフェ");

const groups: SanpoMapPinGroup[] = [
  {
    sanpoMap: mapA,
    pins: [
      makePin("p1", "2026-11-01T00:00:00Z", ["桜", "Park"]),
      makePin("p2", "2026-11-03T00:00:00Z", ["桜"]),
    ],
  },
  {
    sanpoMap: mapB,
    pins: [
      makePin("p3", "2026-11-02T00:00:00Z", ["park", "珈琲"]),
      makePin("p4", "2026-11-04T00:00:00Z", ["桜"]),
    ],
  },
];

describe("buildTagSummaries", () => {
  it("正規化キーで地図をまたいでまとめ、ピン数の多い順 → キーの昇順に並べる", () => {
    const tags = buildTagSummaries(groups);
    expect(tags.map((tag) => [tag.key, tag.pinCount])).toEqual([
      ["桜", 3],
      ["park", 2],
      ["珈琲", 1],
    ]);
  });

  it("表記は同じキーのうちいちばん新しいピンのもの", () => {
    const park = buildTagSummaries(groups).find((tag) => tag.key === "park");
    // p3（11/02）の "park" が p1（11/01）の "Park" より新しい。
    expect(park?.label).toBe("park");
  });

  it("使われている地図を地図一覧の順に重複なく持つ", () => {
    const sakura = buildTagSummaries(groups).find((tag) => tag.key === "桜");
    expect(sakura?.sanpoMaps.map((map) => map.id)).toEqual(["a", "b"]);
    const coffee = buildTagSummaries(groups).find((tag) => tag.key === "珈琲");
    expect(coffee?.sanpoMaps).toEqual([{ id: "b", name: "カフェ", icon: "pin" }]);
  });

  it("1つのピンで同じキーが重なっても1件と数える", () => {
    const tags = buildTagSummaries([
      { sanpoMap: mapA, pins: [makePin("p1", "2026-11-01T00:00:00Z", ["桜", "#桜"])] },
    ]);
    expect(tags).toEqual([
      { key: "桜", label: "桜", pinCount: 1, sanpoMaps: [{ id: "a", name: "散歩", icon: "pin" }] },
    ]);
  });

  it("ピンが無ければ空", () => {
    expect(buildTagSummaries([])).toEqual([]);
    expect(buildTagSummaries([{ sanpoMap: mapA, pins: [] }])).toEqual([]);
  });
});

describe("filterTagSummariesByLabel", () => {
  const tags = buildTagSummaries(groups);

  it("表記の部分一致（大文字小文字を区別しない）で絞り、順序を保つ", () => {
    expect(filterTagSummariesByLabel(tags, " PA ").map((tag) => tag.key)).toEqual(["park"]);
  });

  it("空の query は同じ参照を返す", () => {
    expect(filterTagSummariesByLabel(tags, "  ")).toBe(tags);
  });
});

describe("selectPinsWithTag", () => {
  it("全地図から該当ピンを集め、作成日時の新しい順に地図と一緒に返す", () => {
    const result = selectPinsWithTag(groups, "桜");
    expect(result.map((row) => [row.pin.id, row.sanpoMap.id])).toEqual([
      ["p4", "b"],
      ["p2", "a"],
      ["p1", "a"],
    ]);
  });

  it("表記の違うタグもキーで一致させる", () => {
    expect(selectPinsWithTag(groups, "park").map((row) => row.pin.id)).toEqual(["p3", "p1"]);
  });

  it("該当が無ければ空", () => {
    expect(selectPinsWithTag(groups, "海")).toEqual([]);
  });
});

describe("parseTagLabelParam", () => {
  it("正規化した表記を返す", () => {
    expect(parseTagLabelParam("  #桜  並木 ")).toBe("桜 並木");
  });

  it("文字列でない・空・記号だけ・最大長超えは null", () => {
    expect(parseTagLabelParam(undefined)).toBeNull();
    expect(parseTagLabelParam(["桜", "梅"])).toBeNull();
    expect(parseTagLabelParam("")).toBeNull();
    expect(parseTagLabelParam("###")).toBeNull();
    expect(parseTagLabelParam("あ".repeat(21))).toBeNull();
    expect(parseTagLabelParam("あ".repeat(20))).toBe("あ".repeat(20));
  });
});

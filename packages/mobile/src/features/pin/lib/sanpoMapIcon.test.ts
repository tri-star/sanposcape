import { describe, expect, it } from "vitest";

import { SanpoMapIcon } from "@/api/generated/model";
import {
  attachSanpoMapIcons,
  isSanpoMapIconKey,
  sanpoMapIconFor,
  sanpoMapPinAppearance,
  SANPO_MAP_ICON_META,
  SANPO_MAP_ICON_ORDER,
  toSanpoMapIconKey,
} from "@/features/pin/lib/sanpoMapIcon";
import type { PinSummary } from "@/features/pin/types";

const pin = (id: string, sanpoMapId: string): PinSummary => ({
  id,
  sanpoMapId,
  name: null,
  location: { latitude: 35, longitude: 139 },
});

describe("対応表", () => {
  it("API の enum を網羅している", () => {
    expect(new Set(Object.keys(SANPO_MAP_ICON_META))).toEqual(new Set(Object.values(SanpoMapIcon)));
  });

  it("表示順は重複なしで対応表のキーと同じ集合。先頭は pin", () => {
    expect(new Set(SANPO_MAP_ICON_ORDER).size).toBe(SANPO_MAP_ICON_ORDER.length);
    expect(new Set(SANPO_MAP_ICON_ORDER)).toEqual(new Set(Object.keys(SANPO_MAP_ICON_META)));
    expect(SANPO_MAP_ICON_ORDER[0]).toBe("pin");
  });

  it("pin は従来の登録済みピンと同じ見た目。tone と label が妥当", () => {
    expect(SANPO_MAP_ICON_META.pin).toMatchObject({ glyph: "map-pin", tone: "park" });
    for (const meta of Object.values(SANPO_MAP_ICON_META)) {
      expect(["park", "cafe", "culture", "station"]).toContain(meta.tone);
      expect(meta.label.length).toBeGreaterThan(0);
    }
  });
});

describe("toSanpoMapIconKey / isSanpoMapIconKey", () => {
  it("既知の値はそのまま返す", () => {
    expect(toSanpoMapIconKey("coffee")).toBe("coffee");
  });

  it.each([undefined, null, "unknown-icon", 1, ""])("%s は pin", (value) => {
    expect(toSanpoMapIconKey(value)).toBe("pin");
  });

  it("プロトタイプのキーは false", () => {
    expect(isSanpoMapIconKey("toString")).toBe(false);
  });
});

describe("sanpoMapPinAppearance", () => {
  it("coffee は cafe 色のコーヒーカップ", () => {
    expect(sanpoMapPinAppearance("coffee")).toEqual({ category: "cafe", icon: "coffee" });
  });
});

describe("sanpoMapIconFor", () => {
  const maps = [{ id: "m1", icon: "dog" as const }];
  it("一覧にある id はその icon", () => {
    expect(sanpoMapIconFor(maps, "m1")).toBe("dog");
  });
  it("無い id・空の一覧は pin", () => {
    expect(sanpoMapIconFor(maps, "zzz")).toBe("pin");
    expect(sanpoMapIconFor([], "m1")).toBe("pin");
  });
});

describe("attachSanpoMapIcons", () => {
  const maps = [
    { id: "m1", icon: "dog" as const },
    { id: "m2", icon: "coffee" as const },
  ];

  it("ピンの地図の icon を付け、一覧に無い地図は pin、順序を保つ", () => {
    const result = attachSanpoMapIcons([pin("a", "m2"), pin("b", "m1"), pin("c", "gone")], maps);
    expect(result.map((p) => [p.id, p.sanpoMapIcon])).toEqual([
      ["a", "coffee"],
      ["b", "dog"],
      ["c", "pin"],
    ]);
  });

  it("入力配列を変更しない", () => {
    const input = [pin("a", "m1")];
    attachSanpoMapIcons(input, maps);
    expect(input[0]).not.toHaveProperty("sanpoMapIcon");
  });
});

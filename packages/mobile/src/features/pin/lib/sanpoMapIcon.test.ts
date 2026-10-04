import { describe, expect, it } from "vitest";

import { SanpoMapIcon } from "@/api/generated/model";
import {
  attachSanpoMapIcons,
  sanpoMapIconChangeLabel,
  sanpoMapIconIndexFromSignature,
  sanpoMapIconSignature,
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
      expect(["park", "cafe", "culture", "station", "sky", "brown"]).toContain(meta.tone);
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
  const maps = [{ id: "m1", icon: "cat" as const }];
  it("一覧にある id はその icon", () => {
    expect(sanpoMapIconFor(maps, "m1")).toBe("cat");
  });
  it("無い id・空の一覧は pin", () => {
    expect(sanpoMapIconFor(maps, "zzz")).toBe("pin");
    expect(sanpoMapIconFor([], "m1")).toBe("pin");
  });
});

describe("attachSanpoMapIcons", () => {
  const index = new Map([
    ["m1", "cat" as const],
    ["m2", "coffee" as const],
  ]);

  it("ピンの地図の icon を付け、一覧に無い地図は pin、順序を保つ", () => {
    const result = attachSanpoMapIcons([pin("a", "m2"), pin("b", "m1"), pin("c", "gone")], index);
    expect(result.map((p) => [p.id, p.sanpoMapIcon])).toEqual([
      ["a", "coffee"],
      ["b", "cat"],
      ["c", "pin"],
    ]);
  });

  it("入力配列を変更しない", () => {
    const input = [pin("a", "m1")];
    attachSanpoMapIcons(input, index);
    expect(input[0]).not.toHaveProperty("sanpoMapIcon");
  });
});

describe("sanpoMapIconSignature / sanpoMapIconIndexFromSignature", () => {
  const uuid1 = "11111111-1111-4111-8111-111111111111";
  const uuid2 = "22222222-2222-4222-8222-222222222222";
  const base = [
    { id: uuid1, icon: "cat" as const, name: "A", pinCount: 1 },
    { id: uuid2, icon: "coffee" as const, name: "B", pinCount: 2 },
  ];

  it("名前・pinCount が変わっても同じ文字列（ピン配列の参照を変えない根拠）", () => {
    const renamed = base.map((m) => ({ ...m, name: `${m.name}2`, pinCount: m.pinCount + 1 }));
    expect(sanpoMapIconSignature(renamed)).toBe(sanpoMapIconSignature(base));
  });

  it("アイコン・地図の増減・順序の変化では別の文字列", () => {
    const sig = sanpoMapIconSignature(base);
    expect(sanpoMapIconSignature([{ ...base[0], icon: "tree" }, base[1]])).not.toBe(sig);
    expect(sanpoMapIconSignature([base[0]])).not.toBe(sig);
    expect(sanpoMapIconSignature([base[1], base[0]])).not.toBe(sig);
  });

  it("文字列から地図ID → アイコンを復元できる。空文字・未知の値は空 Map・pin", () => {
    const index = sanpoMapIconIndexFromSignature(sanpoMapIconSignature(base));
    expect(index.get(uuid1)).toBe("cat");
    expect(index.get(uuid2)).toBe("coffee");
    expect(sanpoMapIconIndexFromSignature("").size).toBe(0);
    expect(sanpoMapIconIndexFromSignature(`${uuid1}:unknown`).get(uuid1)).toBe("pin");
  });
});

describe("sanpoMapIconChangeLabel", () => {
  it("現在のアイコンの表示名を含める", () => {
    expect(sanpoMapIconChangeLabel("coffee")).toBe("アイコンを変更（現在: カフェ）");
    expect(sanpoMapIconChangeLabel("pin")).toBe("アイコンを変更（現在: ピン）");
  });

  it("全アイコンで表示名を含む", () => {
    for (const key of SANPO_MAP_ICON_ORDER) {
      expect(sanpoMapIconChangeLabel(key)).toContain(SANPO_MAP_ICON_META[key].label);
    }
  });
});

describe("新しい色（sky / brown）", () => {
  it("雨・避暑地は sky、猫は brown", () => {
    expect(sanpoMapPinAppearance("rain")).toEqual({ category: "sky", icon: "cloud-rain" });
    expect(sanpoMapPinAppearance("retreat").category).toBe("sky");
    expect(sanpoMapPinAppearance("cat")).toEqual({ category: "brown", icon: "cat" });
  });
});

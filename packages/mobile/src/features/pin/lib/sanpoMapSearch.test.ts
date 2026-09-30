import { describe, expect, it } from "vitest";

import {
  filterPinsByName,
  filterSanpoMapsByName,
  matchesNameQuery,
  normalizeNameQuery,
} from "@/features/pin/lib/sanpoMapSearch";

const maps = [{ name: "近所のパン屋" }, { name: "Cafe Tour" }, { name: "桜スポット" }];

describe("normalizeNameQuery", () => {
  it("前後の空白を除き、連続する空白（全角空白を含む）を1つにまとめて小文字化する", () => {
    expect(normalizeNameQuery("  Cafe 　  TOUR ")).toBe("cafe tour");
  });
});

describe("matchesNameQuery", () => {
  it("query が空なら name が null でも true", () => {
    expect(matchesNameQuery(null, "")).toBe(true);
  });

  it("name が null・空白のみなら query があれば false", () => {
    expect(matchesNameQuery(null, "a")).toBe(false);
    expect(matchesNameQuery("   ", "a")).toBe(false);
  });
});

describe("filterSanpoMapsByName", () => {
  it("空・空白だけの検索語は全件を返す（同じ参照）", () => {
    expect(filterSanpoMapsByName(maps, "")).toBe(maps);
    expect(filterSanpoMapsByName(maps, "  　 ")).toBe(maps);
  });

  it("大文字小文字を区別しない", () => {
    expect(filterSanpoMapsByName(maps, "cafe")).toEqual([{ name: "Cafe Tour" }]);
    expect(filterSanpoMapsByName(maps, "TOUR")).toEqual([{ name: "Cafe Tour" }]);
  });

  it("前後の空白・連続空白を無視する", () => {
    expect(filterSanpoMapsByName(maps, "  cafe   tour ")).toEqual([{ name: "Cafe Tour" }]);
    expect(filterSanpoMapsByName(maps, "cafe　tour")).toEqual([{ name: "Cafe Tour" }]);
  });

  it("日本語の部分一致ができる", () => {
    expect(filterSanpoMapsByName(maps, "パン")).toEqual([{ name: "近所のパン屋" }]);
  });

  it("全角英数と半角英数は一致しない（仕様として固定）", () => {
    expect(filterSanpoMapsByName(maps, "ｃａｆｅ")).toEqual([]);
  });

  it("一致しなければ空配列", () => {
    expect(filterSanpoMapsByName(maps, "zzz")).toEqual([]);
  });

  it("順序を保つ", () => {
    const list = [{ name: "b-2" }, { name: "a" }, { name: "b-1" }];
    expect(filterSanpoMapsByName(list, "b")).toEqual([{ name: "b-2" }, { name: "b-1" }]);
  });
});

describe("filterPinsByName", () => {
  const pins = [
    { id: "1", name: "桜の木" },
    { id: "2", name: null },
    { id: "3", name: "   " },
    { id: "4", name: "桜並木" },
  ];

  it("検索語が空なら名前のないピンも残る", () => {
    expect(filterPinsByName(pins, "")).toBe(pins);
  });

  it("検索語があれば name が null・空白のみのピンは除外される", () => {
    expect(filterPinsByName(pins, "桜").map((p) => p.id)).toEqual(["1", "4"]);
    expect(filterPinsByName(pins, "名前のないピン")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import { insertCreatedSanpoMap, replaceUpdatedSanpoMap } from "@/features/pin/lib/sanpoMapCache";
import type { SanpoMap } from "@/features/pin/types";

function map(id: string, isDefault = false): SanpoMap {
  return { id, name: id, isDefault, role: "owner", pinCount: 0, icon: "pin" };
}

describe("insertCreatedSanpoMap", () => {
  it("old が undefined なら [created]", () => {
    expect(insertCreatedSanpoMap(undefined, map("new"))).toEqual([map("new")]);
  });

  it("既定でない地図は先頭の既定地図の直後に入る", () => {
    const old = [map("def", true), map("a"), map("b")];
    expect(insertCreatedSanpoMap(old, map("new")).map((m) => m.id)).toEqual([
      "def",
      "new",
      "a",
      "b",
    ]);
  });

  it("既定地図が無い一覧に既定でない地図を入れると先頭", () => {
    const old = [map("a"), map("b")];
    expect(insertCreatedSanpoMap(old, map("new")).map((m) => m.id)).toEqual(["new", "a", "b"]);
  });

  it("created.isDefault なら先頭", () => {
    const old = [map("a"), map("b")];
    expect(insertCreatedSanpoMap(old, map("new", true)).map((m) => m.id)).toEqual([
      "new",
      "a",
      "b",
    ]);
  });

  it("同じ id が既にあれば変えない", () => {
    const old = [map("def", true), map("new")];
    expect(insertCreatedSanpoMap(old, map("new"))).toEqual(old);
  });

  it("元の配列を変更しない", () => {
    const old = [map("def", true), map("a")];
    const snapshot = [...old];
    insertCreatedSanpoMap(old, map("new"));
    expect(old).toEqual(snapshot);
  });
});

describe("replaceUpdatedSanpoMap", () => {
  it("同じ id の地図を置き換え、位置は変えない", () => {
    const old = [map("a"), map("b"), map("c")];
    const result = replaceUpdatedSanpoMap(old, { ...map("b"), icon: "cat" });
    expect(result?.map((m) => [m.id, m.icon])).toEqual([
      ["a", "pin"],
      ["b", "cat"],
      ["c", "pin"],
    ]);
  });

  it("応答の pinCount が null でも既存の pinCount を残す", () => {
    const old = [{ ...map("a"), pinCount: 7 }];
    const result = replaceUpdatedSanpoMap(old, { ...map("a"), icon: "cat", pinCount: null });
    expect(result?.[0]?.pinCount).toBe(7);
  });

  it("無い id は変化なし（コピーを返す）", () => {
    const old = [map("a")];
    const result = replaceUpdatedSanpoMap(old, map("zzz"));
    expect(result).toEqual(old);
    expect(result).not.toBe(old);
  });

  it("old が undefined なら undefined", () => {
    expect(replaceUpdatedSanpoMap(undefined, map("a"))).toBeUndefined();
  });

  it("元の配列を変更しない", () => {
    const old = [map("a")];
    const snapshot = [...old];
    replaceUpdatedSanpoMap(old, { ...map("a"), icon: "cat" });
    expect(old).toEqual(snapshot);
    expect(old[0]?.icon).toBe("pin");
  });
});

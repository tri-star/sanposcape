import { describe, expect, it } from "vitest";

import { insertCreatedSanpoMap } from "@/features/pin/lib/sanpoMapCache";
import type { SanpoMap } from "@/features/pin/types";

function map(id: string, isDefault = false): SanpoMap {
  return { id, name: id, isDefault, role: "owner", pinCount: 0 };
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

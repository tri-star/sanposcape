import { describe, expect, it } from "vitest";

import {
  countHiddenSanpoMaps,
  sanpoMapPinVisibilityErrorMessage,
  selectPinsVisibleSanpoMaps,
  setSanpoMapPinsVisible,
} from "@/features/pin/lib/visibility/sanpoMapPinVisibility";
import type { SanpoMap } from "@/features/pin/types";

function map(id: string, pinsVisible: boolean): SanpoMap {
  return {
    id,
    name: id,
    isDefault: false,
    role: "owner",
    pinCount: null,
    icon: "pin",
    pinsVisible,
  };
}

describe("selectPinsVisibleSanpoMaps", () => {
  it("有効なら非表示の地図を除き、並び順は保つ", () => {
    const maps = [map("a", true), map("b", false), map("c", true)];

    expect(selectPinsVisibleSanpoMaps(maps, true).map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("非表示の地図が無ければ同じ参照を返す（取得の配線を作り直さない）", () => {
    const maps = [map("a", true), map("b", true)];

    expect(selectPinsVisibleSanpoMaps(maps, true)).toBe(maps);
  });

  it("フラグ OFF（enabled: false）なら非表示の地図も含めてそのまま返す", () => {
    const maps = [map("a", false)];

    expect(selectPinsVisibleSanpoMaps(maps, false)).toBe(maps);
  });

  it("すべて非表示なら空になる", () => {
    expect(selectPinsVisibleSanpoMaps([map("a", false)], true)).toEqual([]);
  });
});

describe("countHiddenSanpoMaps", () => {
  it("非表示の地図の数を数える", () => {
    expect(countHiddenSanpoMaps([map("a", false), map("b", true), map("c", false)], true)).toBe(2);
  });

  it("フラグ OFF なら 0", () => {
    expect(countHiddenSanpoMaps([map("a", false)], false)).toBe(0);
  });
});

describe("setSanpoMapPinsVisible", () => {
  it("指定した地図の pinsVisible だけを書き換え、元の配列は変えない", () => {
    const old = [map("a", true), map("b", true)];

    const next = setSanpoMapPinsVisible(old, "b", false);

    expect(next).toEqual([map("a", true), map("b", false)]);
    expect(next?.[0]).toBe(old[0]);
    expect(old[1]!.pinsVisible).toBe(true);
  });

  it("値が変わらない・該当が無いときは同じ参照を返す", () => {
    const old = [map("a", true)];

    expect(setSanpoMapPinsVisible(old, "a", true)).toBe(old);
    expect(setSanpoMapPinsVisible(old, "missing", false)).toBe(old);
  });

  it("キャッシュが無ければ undefined（作らない）", () => {
    expect(setSanpoMapPinsVisible(undefined, "a", false)).toBeUndefined();
  });
});

describe("sanpoMapPinVisibilityErrorMessage", () => {
  it("分類ごとに案内を返す", () => {
    expect(sanpoMapPinVisibilityErrorMessage("network")).toContain("通信");
    expect(sanpoMapPinVisibilityErrorMessage("not_found")).toContain("見つかりません");
  });
});

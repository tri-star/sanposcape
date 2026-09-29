import { describe, expect, it } from "vitest";

import {
  APP_TAB_ITEMS,
  resolveActiveAppTab,
  resolveVisibleAppTabs,
} from "@/features/navigation/lib/appTabs";

const values = (items: readonly { value: string }[]) => items.map((item) => item.value);

describe("APP_TAB_ITEMS", () => {
  it("ラベルはナビ / ピン / アカウントの順", () => {
    expect(APP_TAB_ITEMS.map((item) => item.label)).toEqual(["ナビ", "ピン", "アカウント"]);
  });

  it("value は app/(tabs)/ のファイル名と一致する index / pins / account の順", () => {
    expect(values(APP_TAB_ITEMS)).toEqual(["index", "pins", "account"]);
  });

  it("value が重複しない", () => {
    const list = values(APP_TAB_ITEMS);
    expect(new Set(list).size).toBe(list.length);
  });

  it("検索・記録タブを含まない", () => {
    const list = values(APP_TAB_ITEMS);
    expect(list).not.toContain("search");
    expect(list).not.toContain("history");
  });
});

describe("resolveVisibleAppTabs", () => {
  it("enabled では3タブ", () => {
    expect(values(resolveVisibleAppTabs({ pinTabGate: "enabled" }))).toEqual([
      "index",
      "pins",
      "account",
    ]);
  });

  it("pending（取得中）では隠さず3タブ", () => {
    expect(values(resolveVisibleAppTabs({ pinTabGate: "pending" }))).toEqual([
      "index",
      "pins",
      "account",
    ]);
  });

  it("disabled（OFF 確定）ではピンタブを除く", () => {
    expect(values(resolveVisibleAppTabs({ pinTabGate: "disabled" }))).toEqual(["index", "account"]);
  });
});

describe("resolveActiveAppTab", () => {
  it.each(["index", "pins", "account"] as const)("%s はそのまま返す", (name) => {
    expect(resolveActiveAppTab(name)).toBe(name);
  });

  it.each([undefined, "search", "history"])("%s は index にする", (name) => {
    expect(resolveActiveAppTab(name)).toBe("index");
  });
});

import { describe, expect, it } from "vitest";

import {
  DEFAULT_PIN_MAP_FILTER,
  canUncheckPinVisitFilterOption,
  isDefaultPinMapFilter,
  setPinVisitFilterOption,
  toPinListFilterParams,
  type PinMapFilter,
} from "@/features/pin/lib/pinMapFilter";

const ONLY_UNVISITED: PinMapFilter = {
  includeArchived: false,
  showUnvisited: true,
  showVisited: false,
};

describe("DEFAULT_PIN_MAP_FILTER", () => {
  it("アーカイブ済みは出さず、未訪問・訪問済みは両方出す", () => {
    expect(DEFAULT_PIN_MAP_FILTER).toEqual({
      includeArchived: false,
      showUnvisited: true,
      showVisited: true,
    });
    expect(isDefaultPinMapFilter(DEFAULT_PIN_MAP_FILTER)).toBe(true);
  });

  it("どれか1つでも違えば既定ではない", () => {
    expect(isDefaultPinMapFilter({ ...DEFAULT_PIN_MAP_FILTER, includeArchived: true })).toBe(false);
    expect(isDefaultPinMapFilter(ONLY_UNVISITED)).toBe(false);
  });
});

describe("toPinListFilterParams", () => {
  it("既定はアーカイブ済みだけを除き、visited のキーは作らない", () => {
    const params = toPinListFilterParams(DEFAULT_PIN_MAP_FILTER);
    expect(params).toEqual({ archived: false });
    expect("visited" in params).toBe(false);
  });

  it("アーカイブ済みも出すときは archived のキーを作らない", () => {
    const params = toPinListFilterParams({ ...DEFAULT_PIN_MAP_FILTER, includeArchived: true });
    expect(params).toEqual({});
    expect("archived" in params).toBe(false);
  });

  it.each([
    [
      { showUnvisited: true, showVisited: false },
      { archived: false, visited: false },
    ],
    [
      { showUnvisited: false, showVisited: true },
      { archived: false, visited: true },
    ],
    [{ showUnvisited: true, showVisited: true }, { archived: false }],
  ])("訪問状況 %o → %o", (visit, expected) => {
    expect(toPinListFilterParams({ includeArchived: false, ...visit })).toEqual(expected);
  });

  it("両方外れた状態が渡されても絞らない（何も出ない地図にしない）", () => {
    expect(
      toPinListFilterParams({ includeArchived: true, showUnvisited: false, showVisited: false }),
    ).toEqual({});
  });
});

describe("canUncheckPinVisitFilterOption", () => {
  it("両方選んでいるときはどちらも外せる", () => {
    expect(canUncheckPinVisitFilterOption(DEFAULT_PIN_MAP_FILTER, "visited")).toBe(true);
    expect(canUncheckPinVisitFilterOption(DEFAULT_PIN_MAP_FILTER, "unvisited")).toBe(true);
  });

  it("最後の1つは外せない", () => {
    expect(canUncheckPinVisitFilterOption(ONLY_UNVISITED, "unvisited")).toBe(false);
  });
});

describe("setPinVisitFilterOption", () => {
  it("チェックを外す・付ける", () => {
    const next = setPinVisitFilterOption(DEFAULT_PIN_MAP_FILTER, "visited", false);
    expect(next).toEqual(ONLY_UNVISITED);
    expect(setPinVisitFilterOption(next, "visited", true)).toEqual(DEFAULT_PIN_MAP_FILTER);
  });

  it("最後の1つを外す操作は無視して同じ参照を返す", () => {
    expect(setPinVisitFilterOption(ONLY_UNVISITED, "unvisited", false)).toBe(ONLY_UNVISITED);
  });

  it("値が変わらないときは同じ参照を返す", () => {
    expect(setPinVisitFilterOption(DEFAULT_PIN_MAP_FILTER, "unvisited", true)).toBe(
      DEFAULT_PIN_MAP_FILTER,
    );
  });

  it("アーカイブの設定は保つ", () => {
    const filter = { ...DEFAULT_PIN_MAP_FILTER, includeArchived: true };
    expect(setPinVisitFilterOption(filter, "unvisited", false).includeArchived).toBe(true);
  });
});

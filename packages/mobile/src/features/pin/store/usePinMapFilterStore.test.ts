import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_PIN_MAP_FILTER } from "@/features/pin/lib/pinMapFilter";
import { usePinMapFilterStore } from "@/features/pin/store/usePinMapFilterStore";

describe("usePinMapFilterStore", () => {
  beforeEach(() => {
    usePinMapFilterStore.setState({ filter: DEFAULT_PIN_MAP_FILTER });
  });

  it("初期値は既定の絞り込み", () => {
    expect(usePinMapFilterStore.getState().filter).toEqual(DEFAULT_PIN_MAP_FILTER);
  });

  it("アーカイブ済みの表示を切り替える", () => {
    usePinMapFilterStore.getState().setIncludeArchived(true);
    expect(usePinMapFilterStore.getState().filter.includeArchived).toBe(true);
  });

  it("訪問状況を切り替え、最後の1つは外せない", () => {
    const { setVisitOption } = usePinMapFilterStore.getState();
    setVisitOption("visited", false);
    expect(usePinMapFilterStore.getState().filter).toMatchObject({
      showUnvisited: true,
      showVisited: false,
    });
    setVisitOption("unvisited", false);
    expect(usePinMapFilterStore.getState().filter.showUnvisited).toBe(true);
  });

  it("値が変わらない操作では filter の参照を変えない", () => {
    const before = usePinMapFilterStore.getState().filter;
    usePinMapFilterStore.getState().setIncludeArchived(false);
    usePinMapFilterStore.getState().setVisitOption("visited", true);
    expect(usePinMapFilterStore.getState().filter).toBe(before);
  });
});

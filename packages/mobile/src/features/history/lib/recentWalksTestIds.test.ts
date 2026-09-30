import { describe, expect, it } from "vitest";

import { recentWalksTestIds } from "@/features/history/lib/recentWalksTestIds";

const PREFIX = "walk-active-recent-walks";

function collect(ids: ReturnType<typeof recentWalksTestIds>): string[] {
  return [
    ids.section,
    ids.error,
    ids.loading,
    ids.empty,
    ids.seeAll,
    ids.item(0),
    ids.item(1),
    ids.item(2),
  ];
}

describe("recentWalksTestIds", () => {
  it("接頭辞なしは記録タブの既存 testID を返す", () => {
    const ids = recentWalksTestIds();
    expect({ ...ids, item: undefined }).toEqual({
      section: "recent-walks-section",
      error: "recent-walks-error",
      loading: "recent-walks-loading",
      empty: "recent-walks-empty",
      seeAll: "history-see-all-walks",
      item: undefined,
    });
    expect(ids.item(0)).toBe("recent-walk-0");
    expect(ids.item(2)).toBe("recent-walk-2");
  });

  it("空文字は接頭辞として扱わず既定値を返す", () => {
    const empty = recentWalksTestIds("");
    const none = recentWalksTestIds();
    expect(collect(empty)).toEqual(collect(none));
  });

  it("接頭辞ありは接頭辞から組み立てる", () => {
    const ids = recentWalksTestIds(PREFIX);
    expect(ids.section).toBe(PREFIX);
    expect(ids.error).toBe(`${PREFIX}-error`);
    expect(ids.loading).toBe(`${PREFIX}-loading`);
    expect(ids.empty).toBe(`${PREFIX}-empty`);
    expect(ids.seeAll).toBe(`${PREFIX}-see-all`);
    expect(ids.item(0)).toBe(`${PREFIX}-item-0`);
  });

  it("接頭辞ありの testID は既定の testID と1つも重複しない", () => {
    const defaults = new Set(collect(recentWalksTestIds()));
    const overlap = collect(recentWalksTestIds(PREFIX)).filter((id) => defaults.has(id));
    expect(overlap).toEqual([]);
  });
});

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
  it.each([
    ["section", "recent-walks-section", `${PREFIX}`],
    ["error", "recent-walks-error", `${PREFIX}-error`],
    ["loading", "recent-walks-loading", `${PREFIX}-loading`],
    ["empty", "recent-walks-empty", `${PREFIX}-empty`],
    ["seeAll", "history-see-all-walks", `${PREFIX}-see-all`],
  ] as const)(
    "%s: 接頭辞なしは既存 testID、接頭辞ありは接頭辞から組み立てる",
    (key, def, prefixed) => {
      expect(recentWalksTestIds()[key]).toBe(def);
      expect(recentWalksTestIds(PREFIX)[key]).toBe(prefixed);
    },
  );

  it.each([
    [0, "recent-walk-0", `${PREFIX}-item-0`],
    [2, "recent-walk-2", `${PREFIX}-item-2`],
  ])("item(%i): 接頭辞なしは既存 testID、接頭辞ありは接頭辞から組み立てる", (i, def, prefixed) => {
    expect(recentWalksTestIds().item(i)).toBe(def);
    expect(recentWalksTestIds(PREFIX).item(i)).toBe(prefixed);
  });

  it("空文字は接頭辞として扱わず既定値を返す", () => {
    expect(collect(recentWalksTestIds(""))).toEqual(collect(recentWalksTestIds()));
  });

  it("接頭辞ありの testID は既定の testID と1つも重複しない", () => {
    const defaults = new Set(collect(recentWalksTestIds()));
    const overlap = collect(recentWalksTestIds(PREFIX)).filter((id) => defaults.has(id));
    expect(overlap).toEqual([]);
  });
});

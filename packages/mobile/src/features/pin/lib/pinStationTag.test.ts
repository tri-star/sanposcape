import { describe, expect, it } from "vitest";

import { PIN_TAGS_MAX_COUNT } from "@/features/pin/lib/pinLimits";
import { mergeStationTag, resolveStationTag } from "@/features/pin/lib/pinStationTag";
import type { TagSuggestion } from "@/features/pin/types";

const base = {
  label: "新宿駅",
  state: "auto",
  userTags: [],
  candidates: [],
} as const;

describe("resolveStationTag", () => {
  it("駅が取れていて外していなければ、その表記を入れる", () => {
    expect(resolveStationTag(base)).toBe("新宿駅");
  });

  it("駅が無い（null）なら入れない", () => {
    expect(resolveStationTag({ ...base, label: null })).toBeNull();
  });

  it("利用者が外した（dismissed）なら、駅が取れていても入れない", () => {
    expect(resolveStationTag({ ...base, state: "dismissed" })).toBeNull();
  });

  it("地図の既存のタグとキーで一致したら、既存の表記に揃える", () => {
    const candidates: TagSuggestion[] = [{ label: "Shinjuku駅", pinCount: 3 }];
    expect(resolveStationTag({ ...base, label: "shinjuku駅", candidates })).toBe("Shinjuku駅");
  });

  it("利用者が同じタグをすでに入れていれば、重ねて入れない", () => {
    expect(resolveStationTag({ ...base, userTags: ["新宿駅"] })).toBeNull();
  });

  it("利用者のタグが上限に達していれば入れない", () => {
    const userTags = Array.from({ length: PIN_TAGS_MAX_COUNT }, (_, i) => `t${i}`);
    expect(resolveStationTag({ ...base, userTags })).toBeNull();
  });

  it("上限の1つ手前なら入れる（合わせて上限ちょうど）", () => {
    const userTags = Array.from({ length: PIN_TAGS_MAX_COUNT - 1 }, (_, i) => `t${i}`);
    expect(resolveStationTag({ ...base, userTags })).toBe("新宿駅");
  });
});

describe("mergeStationTag", () => {
  it("駅のタグを先頭に置く", () => {
    expect(mergeStationTag(["カフェ"], "新宿駅")).toEqual(["新宿駅", "カフェ"]);
  });

  it("駅のタグが無ければ利用者のタグだけ（元の配列は変えない）", () => {
    const userTags = ["カフェ"];
    const merged = mergeStationTag(userTags, null);
    expect(merged).toEqual(["カフェ"]);
    expect(merged).not.toBe(userTags);
  });
});

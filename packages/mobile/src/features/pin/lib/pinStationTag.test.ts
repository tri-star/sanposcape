import { describe, expect, it } from "vitest";

import { PIN_TAGS_MAX_COUNT } from "@/features/pin/lib/pinLimits";
import { addStationTag } from "@/features/pin/lib/pinStationTag";
import type { TagSuggestion } from "@/features/pin/types";

describe("addStationTag", () => {
  it("タグが空なら駅のタグを足す", () => {
    expect(addStationTag({ tags: [], label: "新宿駅", candidates: [] })).toEqual({
      tags: ["新宿駅"],
      added: "新宿駅",
    });
  });

  it("利用者が先に入れたタグの後ろに足す", () => {
    expect(addStationTag({ tags: ["カフェ"], label: "新宿駅", candidates: [] })).toEqual({
      tags: ["カフェ", "新宿駅"],
      added: "新宿駅",
    });
  });

  it("地図の既存のタグとキーで一致したら、既存の表記に揃える", () => {
    const candidates: TagSuggestion[] = [{ label: "Shinjuku駅", pinCount: 3 }];
    // added も揃えた後の表記（破棄確認の比較に使うので、タグ欄の値と一致させる）
    expect(addStationTag({ tags: [], label: "shinjuku駅", candidates })).toEqual({
      tags: ["Shinjuku駅"],
      added: "Shinjuku駅",
    });
  });

  it("利用者が同じタグをすでに入れていれば足さない（null）", () => {
    expect(addStationTag({ tags: ["新宿駅"], label: "新宿駅", candidates: [] })).toBeNull();
  });

  it("上限に達していれば足さない（null）", () => {
    const tags = Array.from({ length: PIN_TAGS_MAX_COUNT }, (_, i) => `t${i}`);
    expect(addStationTag({ tags, label: "新宿駅", candidates: [] })).toBeNull();
  });
});

import { describe, expect, it } from "vitest";

import { PIN_TAGS_MAX_COUNT } from "@/features/pin/lib/pinLimits";
import {
  INITIAL_STATION_TAG_STATE,
  mergeStationTag,
  removeTagWithStation,
  resolveStationTag,
} from "@/features/pin/lib/pinStationTag";
import type { TagSuggestion } from "@/features/pin/types";

const base = {
  label: "新宿駅",
  state: INITIAL_STATION_TAG_STATE,
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

  it("利用者が駅のタグを外した（dismissed）なら、別の駅が取れても入れない", () => {
    const state = { dismissed: true, removedKeys: ["新宿駅"] };
    expect(resolveStationTag({ ...base, label: "代々木駅", state })).toBeNull();
  });

  it("利用者が同じ名前のタグを外していれば入れない（キーで比べる）", () => {
    const state = { dismissed: false, removedKeys: ["shinjuku駅"] };
    expect(resolveStationTag({ ...base, label: "Shinjuku駅", state })).toBeNull();
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

describe("removeTagWithStation", () => {
  it("画面に出ている駅のタグを外すと dismissed になり、利用者のタグは変わらない", () => {
    const next = removeTagWithStation({
      label: "新宿駅",
      stationTag: "新宿駅",
      userTags: ["カフェ"],
      state: INITIAL_STATION_TAG_STATE,
    });
    expect(next.userTags).toEqual(["カフェ"]);
    expect(next.state.dismissed).toBe(true);
    expect(resolveStationTag({ ...base, userTags: next.userTags, state: next.state })).toBeNull();
  });

  it("利用者のタグを外すと取り除き、駅のタグは別の名前なら入ったまま", () => {
    const next = removeTagWithStation({
      label: "カフェ",
      stationTag: "新宿駅",
      userTags: ["カフェ"],
      state: INITIAL_STATION_TAG_STATE,
    });
    expect(next.userTags).toEqual([]);
    expect(next.state.dismissed).toBe(false);
    expect(resolveStationTag({ ...base, userTags: next.userTags, state: next.state })).toBe(
      "新宿駅",
    );
  });

  it("手で入れた駅と同じ名前のタグを外すと、1回で消え、駅のタグとして入れ直さない", () => {
    // 1. 駅の取得より先に、候補チップから「新宿駅」を入れる → 駅のタグは重複で入らない
    const userTags = ["新宿駅"];
    const stationTag = resolveStationTag({ ...base, userTags });
    expect(stationTag).toBeNull();
    expect(mergeStationTag(userTags, stationTag)).toEqual(["新宿駅"]);

    // 2. × を押す
    const next = removeTagWithStation({
      label: "新宿駅",
      stationTag,
      userTags,
      state: INITIAL_STATION_TAG_STATE,
    });

    // 3. 次の描画でも「新宿駅」は現れない
    const after = resolveStationTag({ ...base, userTags: next.userTags, state: next.state });
    expect(mergeStationTag(next.userTags, after)).toEqual([]);
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

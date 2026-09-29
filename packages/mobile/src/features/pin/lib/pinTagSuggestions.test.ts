import { describe, expect, it } from "vitest";

import {
  PIN_TAG_SUGGESTIONS_FETCH_LIMIT,
  PIN_TAG_SUGGESTIONS_VISIBLE_MAX,
  filterTagSuggestions,
  resolveTagLabelForAdd,
  resolveTagSubmitAction,
  resolveTagSuggestionSanpoMapId,
  tagSuggestionHeading,
  toTagSuggestions,
} from "@/features/pin/lib/pinTagSuggestions";
import { PIN_TAGS_MAX_COUNT } from "@/features/pin/lib/pinLimits";
import type { SanpoMap, TagSuggestion } from "@/features/pin/types";

const s = (label: string, pinCount = 1): TagSuggestion => ({ label, pinCount });
const labels = (list: TagSuggestion[]) => list.map((c) => c.label);

describe("toTagSuggestions", () => {
  it("順序を保ったまま camelCase に変換する", () => {
    expect(
      toTagSuggestions([
        { label: "カフェ", pin_count: 3 },
        { label: "公園", pin_count: 1 },
      ]),
    ).toEqual([s("カフェ", 3), s("公園", 1)]);
  });

  it("表記を正規化する", () => {
    expect(
      toTagSuggestions([
        { label: "#カフェ", pin_count: 1 },
        { label: "  a   b  ", pin_count: 1 },
      ]),
    ).toEqual([s("カフェ"), s("a b")]);
  });

  it("空・記号のみ・長すぎるものを捨てる", () => {
    const tooLong = "😀".repeat(21);
    expect(
      toTagSuggestions([
        { label: "", pin_count: 1 },
        { label: "###", pin_count: 1 },
        { label: tooLong, pin_count: 1 },
        { label: "😀".repeat(20), pin_count: 1 },
      ]),
    ).toEqual([s("😀".repeat(20))]);
  });

  it("キーが重複したら先勝ち", () => {
    expect(
      toTagSuggestions([
        { label: "Cafe", pin_count: 2 },
        { label: "cafe", pin_count: 1 },
      ]),
    ).toEqual([s("Cafe", 2)]);
  });
});

describe("resolveTagSuggestionSanpoMapId", () => {
  const maps: SanpoMap[] = [
    { id: "default", name: "最初の地図", isDefault: true, role: "owner" },
    { id: "other", name: "友達の地図", isDefault: false, role: "editor" },
  ];
  const onlyShared: SanpoMap[] = [maps[1]!];

  it.each(["loading", "error"] as const)("status が %s なら null", (status) => {
    expect(resolveTagSuggestionSanpoMapId({ status, maps, selection: { kind: "default" } })).toBe(
      null,
    );
  });

  it("default 選択なら既定地図の id", () => {
    expect(
      resolveTagSuggestionSanpoMapId({ status: "ready", maps, selection: { kind: "default" } }),
    ).toBe("default");
  });

  it("default 選択で既定地図が無ければ null", () => {
    expect(
      resolveTagSuggestionSanpoMapId({
        status: "ready",
        maps: onlyShared,
        selection: { kind: "default" },
      }),
    ).toBe(null);
    expect(
      resolveTagSuggestionSanpoMapId({ status: "ready", maps: [], selection: { kind: "default" } }),
    ).toBe(null);
  });

  it("existing 選択で一覧にあればその id", () => {
    expect(
      resolveTagSuggestionSanpoMapId({
        status: "ready",
        maps,
        selection: { kind: "existing", sanpoMapId: "other" },
      }),
    ).toBe("other");
  });

  it("existing 選択で一覧に無ければ既定地図、無ければ null", () => {
    const selection = { kind: "existing", sanpoMapId: "gone" } as const;
    expect(resolveTagSuggestionSanpoMapId({ status: "ready", maps, selection })).toBe("default");
    expect(resolveTagSuggestionSanpoMapId({ status: "ready", maps: onlyShared, selection })).toBe(
      null,
    );
  });
});

describe("filterTagSuggestions", () => {
  const base = [s("カフェ"), s("古民家カフェ"), s("公園"), s("cafe")];

  it("空入力は先頭から最大件数（元の順序）", () => {
    const many = Array.from({ length: 10 }, (_, i) => s(`t${i}`));
    const result = filterTagSuggestions({ candidates: many, query: "", attached: [] });
    expect(labels(result)).toEqual(labels(many.slice(0, PIN_TAG_SUGGESTIONS_VISIBLE_MAX)));
  });

  it("空白・# だけの入力は空入力と同じ", () => {
    expect(labels(filterTagSuggestions({ candidates: base, query: " # ", attached: [] }))).toEqual(
      labels(base),
    );
  });

  it("前方一致 → 部分一致の順で、一致しないものは出ない", () => {
    expect(labels(filterTagSuggestions({ candidates: base, query: "カ", attached: [] }))).toEqual([
      "カフェ",
      "古民家カフェ",
    ]);
  });

  it("大文字小文字を区別しない", () => {
    expect(
      labels(filterTagSuggestions({ candidates: [s("cafe")], query: "CAF", attached: [] })),
    ).toEqual(["cafe"]);
  });

  it("付与済みと同じキーの候補は出ない", () => {
    expect(
      filterTagSuggestions({ candidates: [s("cafe")], query: "", attached: ["Cafe"] }),
    ).toEqual([]);
  });

  it("一致が多くても最大件数で切れる", () => {
    const many = Array.from({ length: 10 }, (_, i) => s(`t${i}`));
    expect(filterTagSuggestions({ candidates: many, query: "t", attached: [] })).toHaveLength(
      PIN_TAG_SUGGESTIONS_VISIBLE_MAX,
    );
  });

  it("付与済みが上限なら入力に関係なく空", () => {
    const attached = Array.from({ length: PIN_TAGS_MAX_COUNT }, (_, i) => `a${i}`);
    expect(filterTagSuggestions({ candidates: base, query: "", attached })).toEqual([]);
    expect(filterTagSuggestions({ candidates: base, query: "カ", attached })).toEqual([]);
  });

  it("ひらがなとカタカナは同一視しない", () => {
    expect(
      filterTagSuggestions({ candidates: [s("カフェ")], query: "かふぇ", attached: [] }),
    ).toEqual([]);
  });
});

describe("resolveTagLabelForAdd", () => {
  const candidates = [s("Cafe"), s("公園")];

  it.each([
    ["cafe", "Cafe"],
    ["#Cafe ", "Cafe"],
    ["新しいタグ", "新しいタグ"],
  ])("%s -> %s", (query, expected) => {
    expect(resolveTagLabelForAdd(query, candidates)).toBe(expected);
  });
});

describe("resolveTagSubmitAction", () => {
  it.each([
    ["", "dismiss"],
    ["  ", "dismiss"],
    ["#", "dismiss"],
    ["a", "add"],
  ] as const)("%j -> %s", (query, expected) => {
    expect(resolveTagSubmitAction(query)).toBe(expected);
  });
});

describe("tagSuggestionHeading", () => {
  it("空なら『よく使うタグ』、文字ありなら『候補』", () => {
    expect(tagSuggestionHeading("")).toBe("よく使うタグ");
    expect(tagSuggestionHeading(" # ")).toBe("よく使うタグ");
    expect(tagSuggestionHeading("カ")).toBe("候補");
  });
});

describe("PIN_TAG_SUGGESTIONS_FETCH_LIMIT", () => {
  it("backend の範囲（1〜200）に収まる", () => {
    expect(PIN_TAG_SUGGESTIONS_FETCH_LIMIT).toBeGreaterThanOrEqual(1);
    expect(PIN_TAG_SUGGESTIONS_FETCH_LIMIT).toBeLessThanOrEqual(200);
  });
});

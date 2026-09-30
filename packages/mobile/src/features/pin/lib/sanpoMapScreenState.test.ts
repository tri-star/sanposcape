import { describe, expect, it } from "vitest";

import {
  formatPinResultHeading,
  formatSanpoMapPinCount,
  pinRowAccessibilityLabel,
  resolveSanpoMapDetailBodyState,
  resolveSanpoMapListBodyState,
  resolveSanpoMapPinCount,
  resolveSanpoMapPinSectionState,
  sanpoMapNoMatchTitle,
  sanpoMapRowAccessibilityLabel,
  summarizePinTags,
} from "@/features/pin/lib/sanpoMapScreenState";

describe("resolveSanpoMapListBodyState", () => {
  const base = { isSignedIn: true, status: "ready", mapCount: 3, matchedCount: 3 } as const;

  it("ゲストは status に関わらず sign-in-required", () => {
    for (const status of ["loading", "ready", "error"] as const) {
      expect(resolveSanpoMapListBodyState({ ...base, isSignedIn: false, status })).toBe(
        "sign-in-required",
      );
    }
  });

  it("error は loading より先（status は同時に両方にならないが、error 単独で error）", () => {
    expect(resolveSanpoMapListBodyState({ ...base, status: "error" })).toBe("error");
    expect(resolveSanpoMapListBodyState({ ...base, status: "loading" })).toBe("loading");
  });

  it("0件は検索語があっても empty（matchedCount=0 でも empty 優先）", () => {
    expect(resolveSanpoMapListBodyState({ ...base, mapCount: 0, matchedCount: 0 })).toBe("empty");
  });

  it("1件以上あって絞り込みで0件なら no-match", () => {
    expect(resolveSanpoMapListBodyState({ ...base, matchedCount: 0 })).toBe("no-match");
  });

  it("それ以外は ready", () => {
    expect(resolveSanpoMapListBodyState(base)).toBe("ready");
  });
});

describe("resolveSanpoMapDetailBodyState", () => {
  const base = {
    hasSanpoMapId: true,
    isSignedIn: true,
    mapsStatus: "ready",
    mapFound: true,
    mapsFetching: false,
    pinsErrorCode: null,
  } as const;

  it("invalid-id はゲストより先", () => {
    expect(
      resolveSanpoMapDetailBodyState({ ...base, hasSanpoMapId: false, isSignedIn: false }),
    ).toBe("invalid-id");
  });

  it("ゲストは sign-in-required", () => {
    expect(resolveSanpoMapDetailBodyState({ ...base, isSignedIn: false })).toBe("sign-in-required");
  });

  it("ピンの 404 は not-found", () => {
    expect(resolveSanpoMapDetailBodyState({ ...base, pinsErrorCode: "not_found" })).toBe(
      "not-found",
    );
  });

  it("地図一覧が ready で見つからなければ not-found", () => {
    expect(resolveSanpoMapDetailBodyState({ ...base, mapFound: false })).toBe("not-found");
  });

  it("一覧に id が無くても、一覧の取得（取り直しを含む）中は loading", () => {
    expect(resolveSanpoMapDetailBodyState({ ...base, mapFound: false, mapsFetching: true })).toBe(
      "loading",
    );
  });

  it("一覧に id があれば、一覧の取得中でも ready のまま（引っ張って更新中に画面を消さない）", () => {
    expect(resolveSanpoMapDetailBodyState({ ...base, mapsFetching: true })).toBe("ready");
  });

  it("一覧の取得中でも、ピンの 404 は not-found", () => {
    expect(
      resolveSanpoMapDetailBodyState({
        ...base,
        mapFound: false,
        mapsFetching: true,
        pinsErrorCode: "not_found",
      }),
    ).toBe("not-found");
  });

  it("地図一覧の error は error、loading は loading", () => {
    expect(resolveSanpoMapDetailBodyState({ ...base, mapsStatus: "error", mapFound: false })).toBe(
      "error",
    );
    expect(
      resolveSanpoMapDetailBodyState({ ...base, mapsStatus: "loading", mapFound: false }),
    ).toBe("loading");
  });

  it("ピンの 500 は画面全体には影響せず ready のまま", () => {
    expect(resolveSanpoMapDetailBodyState({ ...base, pinsErrorCode: "server" })).toBe("ready");
  });

  it("問題なければ ready", () => {
    expect(resolveSanpoMapDetailBodyState(base)).toBe("ready");
  });
});

describe("resolveSanpoMapPinSectionState", () => {
  it("error → loading → empty → no-match → ready の順", () => {
    expect(resolveSanpoMapPinSectionState({ status: "error", pinCount: 0, matchedCount: 0 })).toBe(
      "error",
    );
    expect(
      resolveSanpoMapPinSectionState({ status: "loading", pinCount: 0, matchedCount: 0 }),
    ).toBe("loading");
    expect(resolveSanpoMapPinSectionState({ status: "ready", pinCount: 0, matchedCount: 0 })).toBe(
      "empty",
    );
    expect(resolveSanpoMapPinSectionState({ status: "ready", pinCount: 5, matchedCount: 0 })).toBe(
      "no-match",
    );
    expect(resolveSanpoMapPinSectionState({ status: "ready", pinCount: 5, matchedCount: 2 })).toBe(
      "ready",
    );
  });
});

describe("resolveSanpoMapPinCount", () => {
  it("読み終えて未打ち切りなら読み込んだ件数", () => {
    expect(
      resolveSanpoMapPinCount({
        listPinCount: 9,
        pinsStatus: "ready",
        loadedCount: 3,
        truncated: false,
      }),
    ).toBe(3);
  });

  it("打ち切り・読み込み中・エラーなら一覧の値", () => {
    expect(
      resolveSanpoMapPinCount({
        listPinCount: 1500,
        pinsStatus: "ready",
        loadedCount: 1000,
        truncated: true,
      }),
    ).toBe(1500);
    expect(
      resolveSanpoMapPinCount({
        listPinCount: 4,
        pinsStatus: "loading",
        loadedCount: 0,
        truncated: false,
      }),
    ).toBe(4);
    expect(
      resolveSanpoMapPinCount({
        listPinCount: 4,
        pinsStatus: "error",
        loadedCount: 0,
        truncated: false,
      }),
    ).toBe(4);
  });

  it("一覧も null なら null", () => {
    expect(
      resolveSanpoMapPinCount({
        listPinCount: null,
        pinsStatus: "loading",
        loadedCount: 0,
        truncated: false,
      }),
    ).toBeNull();
  });
});

describe("formatSanpoMapPinCount", () => {
  it("0 は「ピン 0件」、null は null", () => {
    expect(formatSanpoMapPinCount(0)).toBe("ピン 0件");
    expect(formatSanpoMapPinCount(12)).toBe("ピン 12件");
    expect(formatSanpoMapPinCount(null)).toBeNull();
  });
});

describe("formatPinResultHeading", () => {
  it("検索語の有無で出し分ける", () => {
    expect(formatPinResultHeading({ matchedCount: 12, query: "" })).toBe("12 件のピン");
    expect(formatPinResultHeading({ matchedCount: 12, query: "  " })).toBe("12 件のピン");
    expect(formatPinResultHeading({ matchedCount: 3, query: " 桜 " })).toBe("「桜」に一致: 3 件");
  });
});

describe("summarizePinTags", () => {
  const tags = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `t${i}` }));

  it("0件", () => {
    expect(summarizePinTags([])).toEqual({ visible: [], hiddenCount: 0 });
  });

  it("3件ちょうどは全部見える", () => {
    expect(summarizePinTags(tags(3))).toEqual({ visible: ["t0", "t1", "t2"], hiddenCount: 0 });
  });

  it("5件なら hiddenCount 2", () => {
    expect(summarizePinTags(tags(5))).toEqual({ visible: ["t0", "t1", "t2"], hiddenCount: 2 });
  });

  it("max を指定できる", () => {
    expect(summarizePinTags(tags(3), 1)).toEqual({ visible: ["t0"], hiddenCount: 2 });
  });
});

describe("sanpoMapNoMatchTitle", () => {
  it("trim した検索語を出す", () => {
    expect(sanpoMapNoMatchTitle("  パン ")).toBe("「パン」に一致する地図がありません");
  });
});

describe("sanpoMapRowAccessibilityLabel", () => {
  const base = { name: "桜", pinCount: 3, isDefault: false, role: "owner" };

  it("名前とピン件数を読み上げる", () => {
    expect(sanpoMapRowAccessibilityLabel(base)).toBe("地図「桜」、ピン 3件");
  });

  it("既定・招待のバッジも合成し、件数が null なら件数は含めない", () => {
    expect(
      sanpoMapRowAccessibilityLabel({ ...base, pinCount: null, isDefault: true, role: "editor" }),
    ).toBe("地図「桜」、既定の地図、招待された地図");
  });
});

describe("pinRowAccessibilityLabel", () => {
  it("名前・日時・タグを合成する（タグは先頭3件＋残り件数）", () => {
    const tags = ["a", "b", "c", "d"].map((label) => ({ label }));
    expect(
      pinRowAccessibilityLabel({ displayName: "カフェ", createdAtLabel: "2026/09/01", tags }),
    ).toBe("カフェ、2026/09/01、タグ a、b、c、ほか1件");
  });

  it("日時もタグも無ければ名前だけ", () => {
    expect(
      pinRowAccessibilityLabel({ displayName: "カフェ", createdAtLabel: null, tags: [] }),
    ).toBe("カフェ");
  });
});

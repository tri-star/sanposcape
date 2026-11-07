import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import type { TagSummary } from "@/features/pin/lib/tag/pinTagIndex";
import {
  combineSanpoMapPins,
  resolveTagDetailBodyState,
  resolveTagListBodyState,
  tagRowAccessibilityLabel,
  type SanpoMapPinsQueryResult,
} from "@/features/pin/lib/tag/tagScreenState";
import type { SanpoMap } from "@/features/pin/types";

function makeMap(id: string): SanpoMap {
  return {
    id,
    name: id,
    isDefault: false,
    role: "owner",
    pinCount: null,
    icon: "pin",
    pinsVisible: true,
  };
}

const ready = (truncated = false): SanpoMapPinsQueryResult => ({
  data: { pins: [], truncated },
  error: null,
  isPending: false,
  isError: false,
  isFetching: false,
});
const pending: SanpoMapPinsQueryResult = {
  data: undefined,
  error: null,
  isPending: true,
  isError: false,
  isFetching: true,
};
const failed = (status: number): SanpoMapPinsQueryResult => ({
  data: undefined,
  error: new ApiError(status),
  isPending: false,
  isError: true,
  isFetching: false,
});

describe("combineSanpoMapPins", () => {
  const maps = [makeMap("a"), makeMap("b")];
  const base = { mapsStatus: "ready", mapsErrorCode: null, maps } as const;

  it("全地図のデータがそろえば ready で、地図一覧の順に groups を返す", () => {
    const result = combineSanpoMapPins({ ...base, results: [ready(), ready(true)] });
    expect(result.status).toBe("ready");
    expect(result.groups.map((group) => group.sanpoMap.id)).toEqual(["a", "b"]);
    expect(result.truncated).toBe(true);
  });

  it("取得中の地図があれば loading", () => {
    expect(combineSanpoMapPins({ ...base, results: [ready(), pending] }).status).toBe("loading");
  });

  it("失敗した地図があれば loading より先に error", () => {
    const result = combineSanpoMapPins({ ...base, results: [pending, failed(500)] });
    expect(result.status).toBe("error");
    expect(result.errorCode).toBe("server");
  });

  it("404 の地図は飛ばす", () => {
    const result = combineSanpoMapPins({ ...base, results: [ready(), failed(404)] });
    expect(result.status).toBe("ready");
    expect(result.groups.map((group) => group.sanpoMap.id)).toEqual(["a"]);
  });

  it("地図一覧の状態を先に見る", () => {
    expect(
      combineSanpoMapPins({
        mapsStatus: "error",
        mapsErrorCode: "network",
        maps: [],
        results: [],
      }),
    ).toMatchObject({ status: "error", errorCode: "network" });
    expect(
      combineSanpoMapPins({ mapsStatus: "loading", mapsErrorCode: null, maps: [], results: [] })
        .status,
    ).toBe("loading");
  });

  it("地図が0件なら ready で groups は空", () => {
    expect(combineSanpoMapPins({ ...base, maps: [], results: [] })).toEqual({
      status: "ready",
      errorCode: null,
      groups: [],
      truncated: false,
    });
  });
});

describe("resolveTagListBodyState", () => {
  const base = { isSignedIn: true, status: "ready", tagCount: 2, matchedCount: 2 } as const;

  it("判定順: sign-in-required → error → loading → empty → no-match → ready", () => {
    expect(resolveTagListBodyState({ ...base, isSignedIn: false, status: "error" })).toBe(
      "sign-in-required",
    );
    expect(resolveTagListBodyState({ ...base, status: "error" })).toBe("error");
    expect(resolveTagListBodyState({ ...base, status: "loading" })).toBe("loading");
    expect(resolveTagListBodyState({ ...base, tagCount: 0, matchedCount: 0 })).toBe("empty");
    expect(resolveTagListBodyState({ ...base, matchedCount: 0 })).toBe("no-match");
    expect(resolveTagListBodyState(base)).toBe("ready");
  });
});

describe("resolveTagDetailBodyState", () => {
  const base = {
    hasLabel: true,
    isSignedIn: true,
    status: "ready",
    pinCount: 1,
    fetching: false,
  } as const;

  it("判定順: invalid-label → sign-in-required → error → loading → empty → ready", () => {
    expect(resolveTagDetailBodyState({ ...base, hasLabel: false, isSignedIn: false })).toBe(
      "invalid-label",
    );
    expect(resolveTagDetailBodyState({ ...base, isSignedIn: false })).toBe("sign-in-required");
    expect(resolveTagDetailBodyState({ ...base, status: "error" })).toBe("error");
    expect(resolveTagDetailBodyState({ ...base, status: "loading" })).toBe("loading");
    expect(resolveTagDetailBodyState({ ...base, pinCount: 0 })).toBe("empty");
    expect(resolveTagDetailBodyState(base)).toBe("ready");
  });

  it("0件でも取り直しの最中は loading（キャッシュの古い一覧で空を出さない）。該当があれば取り直し中も ready", () => {
    expect(resolveTagDetailBodyState({ ...base, pinCount: 0, fetching: true })).toBe("loading");
    expect(resolveTagDetailBodyState({ ...base, fetching: true })).toBe("ready");
  });
});

describe("tagRowAccessibilityLabel", () => {
  const map = (name: string) => ({ id: name, name, icon: "pin" as const });

  it("表記・件数・地図名を合成し、地図が多ければ残りを件数にまとめる", () => {
    const tag: TagSummary = {
      key: "桜",
      label: "桜",
      pinCount: 5,
      sanpoMaps: [map("A"), map("B"), map("C"), map("D")],
    };
    expect(tagRowAccessibilityLabel(tag)).toBe("タグ「桜」、ピン 5件、地図 A、B、C、ほか1件");
  });
});

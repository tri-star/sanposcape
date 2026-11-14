import { describe, expect, it } from "vitest";

import { ApiError } from "@/api/apiError";
import {
  locationSearchErrorMessage,
  locationSearchResultMessage,
} from "@/features/pin/lib/location-search/locationSearchMessage";

describe("locationSearchResultMessage", () => {
  it("0件なら検索語を入れて「見つからない」と出す", () => {
    expect(locationSearchResultMessage({ query: "far", resultCount: 0, scope: "expanded" })).toBe(
      "「far」に当てはまる場所は見つかりませんでした",
    );
  });

  it("表示範囲の外まで広げて見つけたときはそのことを出す", () => {
    expect(
      locationSearchResultMessage({ query: "駅", resultCount: 1, scope: "expanded" }),
    ).toContain("付近から探しました");
  });

  it("表示範囲の中で見つかったときは何も出さない", () => {
    expect(
      locationSearchResultMessage({ query: "駅", resultCount: 3, scope: "visible_area" }),
    ).toBeNull();
  });
});

describe("locationSearchErrorMessage", () => {
  it("429・503・通信の失敗を分け、それ以外はまとめる", () => {
    expect(locationSearchErrorMessage(new ApiError(429))).toContain("上限");
    expect(locationSearchErrorMessage(new ApiError(503))).toContain("地図サービス");
    expect(locationSearchErrorMessage(new TypeError("Network request failed"))).toContain("通信");
    expect(locationSearchErrorMessage(new ApiError(422))).toBe(
      "検索できませんでした。もう一度お試しください",
    );
    expect(locationSearchErrorMessage(new Error("x"))).toBe(
      "検索できませんでした。もう一度お試しください",
    );
  });
});

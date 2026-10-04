import { describe, expect, it } from "vitest";

import {
  SANPO_MAP_PIN_PAGE_SIZE,
  buildSanpoMapPinListParams,
} from "@/features/pin/lib/sanpoMapPinList";

const ID = "11111111-1111-4111-8111-111111111111";

describe("buildSanpoMapPinListParams", () => {
  it("cursor が null ならキー自体が無い", () => {
    const params = buildSanpoMapPinListParams({ sanpoMapId: ID, cursor: null });
    expect("cursor" in params).toBe(false);
  });

  it("cursor が空文字でもキーが無い", () => {
    const params = buildSanpoMapPinListParams({ sanpoMapId: ID, cursor: "" });
    expect("cursor" in params).toBe(false);
  });

  it("cursor が文字列なら入る", () => {
    expect(buildSanpoMapPinListParams({ sanpoMapId: ID, cursor: "abc" }).cursor).toBe("abc");
  });

  it("limit は常に 200", () => {
    expect(SANPO_MAP_PIN_PAGE_SIZE).toBe(200);
    expect(buildSanpoMapPinListParams({ sanpoMapId: ID, cursor: null }).limit).toBe(200);
  });

  it("archived / visited は送らない（一覧はアーカイブ済みも出す。SS-173）", () => {
    const params = buildSanpoMapPinListParams({ sanpoMapId: ID, cursor: "c" });
    expect("archived" in params).toBe(false);
    expect("visited" in params).toBe(false);
  });

  it("sanpo_map_id・limit（・cursor）以外のキーが無い", () => {
    expect(
      Object.keys(buildSanpoMapPinListParams({ sanpoMapId: ID, cursor: null })).sort(),
    ).toEqual(["limit", "sanpo_map_id"]);
    expect(Object.keys(buildSanpoMapPinListParams({ sanpoMapId: ID, cursor: "c" })).sort()).toEqual(
      ["cursor", "limit", "sanpo_map_id"],
    );
  });
});

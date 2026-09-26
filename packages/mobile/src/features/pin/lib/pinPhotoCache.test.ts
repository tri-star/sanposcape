import { describe, expect, it } from "vitest";

import { pinPhotoCacheKey } from "@/features/pin/lib/pinPhotoCache";

describe("pinPhotoCacheKey", () => {
  it("同じ id・variant なら同じキーになる", () => {
    expect(pinPhotoCacheKey("photo-1", "thumb")).toBe(pinPhotoCacheKey("photo-1", "thumb"));
  });

  it("variant が違えば別のキーになる", () => {
    expect(pinPhotoCacheKey("photo-1", "thumb")).not.toBe(pinPhotoCacheKey("photo-1", "original"));
  });

  it("id が違えば別のキーになる", () => {
    expect(pinPhotoCacheKey("photo-1", "thumb")).not.toBe(pinPhotoCacheKey("photo-2", "thumb"));
  });

  // シグネチャが (photoId, variant) の2引数だけであること自体が「URL が変わってもキーが
  // 同じ」ことの担保（URL を受け取る余地が型上ない）。
  it("URL を引数に取らない（同じ id・variant なら常に同じキー）", () => {
    const first = pinPhotoCacheKey("photo-1", "original");
    const second = pinPhotoCacheKey("photo-1", "original");
    expect(first).toBe(second);
    expect(first).toBe("pin-photo:photo-1:original");
  });
});

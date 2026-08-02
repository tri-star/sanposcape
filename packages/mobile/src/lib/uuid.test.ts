import { describe, expect, it } from "vitest";

import { isUuid, randomUuidV4 } from "@/lib/uuid";

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("randomUuidV4", () => {
  it("UUID v4 の形式に一致する", () => {
    expect(randomUuidV4()).toMatch(UUID_V4_PATTERN);
  });

  it("random を () => 0 に固定すると決定的な値になり、version/variant ビットが立つ", () => {
    const result = randomUuidV4(() => 0);
    expect(result).toBe("00000000-0000-4000-8000-000000000000");
    expect(result).toMatch(UUID_V4_PATTERN);
  });

  it("random を1に近い値へ固定すると決定的な値になり、version/variant ビットが立つ", () => {
    const result = randomUuidV4(() => 0.999999);
    expect(result).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(result).toMatch(UUID_V4_PATTERN);
  });

  it("random が 1.0 を返しても 0..1 未満にクランプして byte 化する", () => {
    const result = randomUuidV4(() => 1);
    expect(result).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(result).toMatch(UUID_V4_PATTERN);
  });
});

describe("isUuid", () => {
  it("小文字の8-4-4-4-12形式を受け入れる", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-426614174000")).toBe(true);
  });

  it("大文字混じりでも受け入れる（case-insensitive）", () => {
    expect(isUuid("123E4567-E89B-12D3-A456-426614174000")).toBe(true);
  });

  it("version/variant を問わず受け入れる（サーバー生成のUUIDを弾かないため）", () => {
    // version 1（時刻ベース）・variant が RFC4122 以外のビットパターンでも通す。
    expect(isUuid("123e4567-e89b-12d3-0456-426614174000")).toBe(true);
    expect(isUuid("123e4567-e89b-42d3-f456-426614174000")).toBe(true);
  });

  it("空文字は拒否する", () => {
    expect(isUuid("")).toBe(false);
  });

  it("ディープリンク経由の path traversal 文字列は拒否する", () => {
    expect(isUuid("../../users/me")).toBe(false);
  });

  it("エンコード済みの `/`（%2F）が混ざった文字列は拒否する", () => {
    expect(isUuid("123e4567-e89b-12d3-a456-%2F26614174000")).toBe(false);
  });

  it("UUIDに似ているが長さが違う文字列は拒否する（桁不足・桁超過とも）", () => {
    // 各グループが1文字短い
    expect(isUuid("123e456-e89b-12d3-a456-426614174000")).toBe(false);
    // 各グループが1文字長い
    expect(isUuid("123e45678-e89b-12d3-a456-426614174000")).toBe(false);
    // ハイフンの位置がずれている
    expect(isUuid("123e4567e89b-12d3-a456-426614174000")).toBe(false);
  });

  it("文字列以外は拒否する", () => {
    expect(isUuid(undefined)).toBe(false);
    expect(isUuid(null)).toBe(false);
    expect(isUuid(123)).toBe(false);
    expect(isUuid(["123e4567-e89b-12d3-a456-426614174000"])).toBe(false);
  });
});

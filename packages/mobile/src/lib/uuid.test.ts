import { describe, expect, it } from "vitest";

import { randomUuidV4 } from "@/lib/uuid";

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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

  it("1000回生成しても重複しない", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i += 1) {
      seen.add(randomUuidV4());
    }
    expect(seen.size).toBe(1000);
  });
});

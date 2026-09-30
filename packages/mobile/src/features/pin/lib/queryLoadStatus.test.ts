import { describe, expect, it } from "vitest";

import { resolveQueryLoadStatus } from "@/features/pin/lib/queryLoadStatus";

describe("resolveQueryLoadStatus", () => {
  it("データが無く取得中なら loading", () => {
    expect(resolveQueryLoadStatus({ isPending: true, isError: false, hasData: false })).toBe(
      "loading",
    );
  });

  it("データが無いまま失敗したら error", () => {
    expect(resolveQueryLoadStatus({ isPending: false, isError: true, hasData: false })).toBe(
      "error",
    );
  });

  it("データがあれば ready", () => {
    expect(resolveQueryLoadStatus({ isPending: false, isError: false, hasData: true })).toBe(
      "ready",
    );
  });

  it("データがある状態で再取得に失敗しても ready のまま（表示中のデータを消さない）", () => {
    expect(resolveQueryLoadStatus({ isPending: false, isError: true, hasData: true })).toBe(
      "ready",
    );
  });
});

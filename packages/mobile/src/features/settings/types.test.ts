import { describe, expect, it } from "vitest";

import { isAccountDeleteBusy } from "@/features/settings/types";

describe("isAccountDeleteBusy", () => {
  it("idle では false（未実行）", () => {
    expect(isAccountDeleteBusy("idle")).toBe(false);
  });

  it("deleting では true（実行中）", () => {
    expect(isAccountDeleteBusy("deleting")).toBe(true);
  });

  it("deleted では true（AuthGate の退避が完了するまでの間、操作を受け付けない。SS-62 ローカルレビュー A-1 の回帰防止）", () => {
    expect(isAccountDeleteBusy("deleted")).toBe(true);
  });

  it("error では false（失敗表示中は再試行できる必要がある）", () => {
    expect(isAccountDeleteBusy("error")).toBe(false);
  });
});

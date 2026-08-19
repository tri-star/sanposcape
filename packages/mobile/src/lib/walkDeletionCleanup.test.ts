import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  registerWalkDeletionCleanup,
  resetWalkDeletionCleanupForTest,
  runWalkDeletionCleanup,
} from "@/lib/walkDeletionCleanup";

describe("walkDeletionCleanup", () => {
  beforeEach(() => {
    resetWalkDeletionCleanupForTest();
  });

  it("登録した後始末関数が削除された walkId を受け取って呼ばれる", () => {
    const cleanup = vi.fn();
    registerWalkDeletionCleanup(cleanup);

    runWalkDeletionCleanup("walk-1");

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(cleanup).toHaveBeenCalledWith("walk-1");
  });

  it("複数登録してもすべて呼ばれる", () => {
    const cleanupA = vi.fn();
    const cleanupB = vi.fn();
    registerWalkDeletionCleanup(cleanupA);
    registerWalkDeletionCleanup(cleanupB);

    runWalkDeletionCleanup("walk-1");

    expect(cleanupA).toHaveBeenCalledTimes(1);
    expect(cleanupB).toHaveBeenCalledTimes(1);
  });

  it("1つの後始末関数が例外を投げても他の後始末関数は実行される", () => {
    const cleanupOk = vi.fn();
    registerWalkDeletionCleanup(() => {
      throw new Error("boom");
    });
    registerWalkDeletionCleanup(cleanupOk);

    expect(() => runWalkDeletionCleanup("walk-1")).not.toThrow();
    expect(cleanupOk).toHaveBeenCalledTimes(1);
  });

  it("未登録の状態で呼んでも throw しない", () => {
    expect(() => runWalkDeletionCleanup("walk-1")).not.toThrow();
  });
});

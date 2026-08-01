import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  registerSessionCleanup,
  resetSessionCleanupForTest,
  runSessionCleanup,
} from "@/lib/sessionCleanup";

describe("sessionCleanup", () => {
  beforeEach(() => {
    resetSessionCleanupForTest();
  });

  it("登録した後始末関数をすべて実行する", () => {
    const cleanupA = vi.fn();
    const cleanupB = vi.fn();
    registerSessionCleanup(cleanupA);
    registerSessionCleanup(cleanupB);

    runSessionCleanup();

    expect(cleanupA).toHaveBeenCalledTimes(1);
    expect(cleanupB).toHaveBeenCalledTimes(1);
  });

  it("1つの後始末関数が例外を投げても他の後始末関数は実行される", () => {
    const cleanupOk = vi.fn();
    registerSessionCleanup(() => {
      throw new Error("boom");
    });
    registerSessionCleanup(cleanupOk);

    expect(() => runSessionCleanup()).not.toThrow();
    expect(cleanupOk).toHaveBeenCalledTimes(1);
  });

  it("同じ関数を2回登録しても1回しか実行されない（Set による重複排除）", () => {
    const cleanup = vi.fn();
    registerSessionCleanup(cleanup);
    registerSessionCleanup(cleanup);

    runSessionCleanup();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });
});

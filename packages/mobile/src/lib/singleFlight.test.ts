import { describe, expect, it, vi } from "vitest";

import { createSingleFlight } from "@/lib/singleFlight";

describe("createSingleFlight", () => {
  it("同時に複数回呼ぶと fn は1回だけ実行され、全て同じ値で解決する", async () => {
    const fn = vi.fn(() => Promise.resolve("value"));
    const flight = createSingleFlight(fn);

    const results = await Promise.all([flight(), flight(), flight()]);

    expect(fn).toHaveBeenCalledTimes(1);
    expect(results).toEqual(["value", "value", "value"]);
  });

  it("解決後に再度呼ぶと fn がもう1回実行される（キャッシュではない）", async () => {
    const fn = vi.fn(() => Promise.resolve("value"));
    const flight = createSingleFlight(fn);

    await flight();
    await flight();

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("reject した場合、同時に待っていた全呼び出しに reject が伝播する", async () => {
    const error = new Error("boom");
    const fn = vi.fn(() => Promise.reject(error));
    const flight = createSingleFlight(fn);

    const results = await Promise.allSettled([flight(), flight(), flight()]);

    expect(fn).toHaveBeenCalledTimes(1);
    for (const result of results) {
      expect(result.status).toBe("rejected");
      if (result.status === "rejected") {
        expect(result.reason).toBe(error);
      }
    }
  });

  it("reject 後に再度呼ぶと fn が新しく実行される（詰まらない）", async () => {
    const fn = vi.fn().mockRejectedValueOnce(new Error("first")).mockResolvedValueOnce("second");
    const flight = createSingleFlight(fn);

    await expect(flight()).rejects.toThrow("first");
    await expect(flight()).resolves.toBe("second");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("fn が同期的に throw しても inFlight が残らない", async () => {
    const fn = vi.fn(() => {
      throw new Error("sync boom");
    });
    const flight = createSingleFlight(fn);

    await expect(flight()).rejects.toThrow("sync boom");
    await expect(flight()).rejects.toThrow("sync boom");
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

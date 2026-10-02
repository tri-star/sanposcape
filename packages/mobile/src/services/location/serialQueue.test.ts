import { describe, expect, it } from "vitest";

import { createSerialQueue } from "@/services/location/serialQueue";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createSerialQueue", () => {
  it("後から積んだ処理は前の処理の完了後に始まる", async () => {
    const enqueue = createSerialQueue();
    const log: string[] = [];
    const first = deferred<void>();

    const p1 = enqueue(async () => {
      log.push("first:start");
      await first.promise;
      log.push("first:end");
    });
    const p2 = enqueue(async () => {
      log.push("second:start");
    });

    await Promise.resolve();
    expect(log).toEqual(["first:start"]);
    first.resolve();
    await Promise.all([p1, p2]);
    expect(log).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("前の処理が reject しても次は実行され、結果・エラーは呼び出し元に返る", async () => {
    const enqueue = createSerialQueue();
    const p1 = enqueue(async () => {
      throw new Error("boom");
    });
    const p2 = enqueue(async () => "ok");
    await expect(p1).rejects.toThrow("boom");
    await expect(p2).resolves.toBe("ok");
  });
});

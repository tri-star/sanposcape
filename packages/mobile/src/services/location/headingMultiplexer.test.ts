import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createHeadingMultiplexer,
  type HeadingSourceHandlers,
} from "@/services/location/headingMultiplexer";

const STOP_DELAY_MS = 1000;

/** 開始・停止の回数を数え、`emit` / `fail` を外から呼べるネイティブ購読のフェイク。 */
function createFakeSource(options?: { failTimes?: number }) {
  let failTimes = options?.failTimes ?? 0;
  const state = { starts: 0, removes: 0, handlers: null as HeadingSourceHandlers | null };
  const start = vi.fn(async (handlers: HeadingSourceHandlers) => {
    state.starts += 1;
    if (failTimes > 0) {
      failTimes -= 1;
      throw new Error("start failed");
    }
    state.handlers = handlers;
    return {
      remove() {
        state.removes += 1;
      },
    };
  });
  return { start, state };
}

function setup(options?: { failTimes?: number }) {
  const source = createFakeSource(options);
  const multiplexer = createHeadingMultiplexer(source.start, { stopDelayMs: STOP_DELAY_MS });
  return { ...source, multiplexer };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createHeadingMultiplexer", () => {
  it("複数の購読でもネイティブの購読は1本だけ始め、全員に配る", async () => {
    const { multiplexer, state } = setup();
    const a = vi.fn();
    const b = vi.fn();

    await Promise.all([multiplexer.subscribe(a), multiplexer.subscribe(b)]);
    state.handlers?.emit(90);

    expect(state.starts).toBe(1);
    expect(a).toHaveBeenCalledWith(90);
    expect(b).toHaveBeenCalledWith(90);
  });

  it("最後の購読を外してから猶予の後にだけネイティブの購読を止める", async () => {
    const { multiplexer, state } = setup();

    const first = await multiplexer.subscribe(vi.fn());
    const second = await multiplexer.subscribe(vi.fn());
    first.remove();
    await vi.advanceTimersByTimeAsync(STOP_DELAY_MS);
    expect(state.removes).toBe(0);

    second.remove();
    second.remove(); // 二重に呼んでも安全
    await vi.advanceTimersByTimeAsync(STOP_DELAY_MS - 1);
    expect(state.removes).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(state.removes).toBe(1);
  });

  it("猶予の間に購読し直すと、ネイティブの購読と直近の方位を使い回す（タブの切り替え）", async () => {
    const { multiplexer, state } = setup();
    const first = await multiplexer.subscribe(vi.fn());
    state.handlers?.emit(45);
    first.remove();

    const next = vi.fn();
    await multiplexer.subscribe(next);
    await vi.advanceTimersByTimeAsync(STOP_DELAY_MS * 2);

    expect(state.starts).toBe(1);
    expect(state.removes).toBe(0);
    expect(next).toHaveBeenCalledWith(45);
  });

  it("止めた後に購読し直すと、前回の方位は渡さず開始し直す", async () => {
    const { multiplexer, state } = setup();
    const first = await multiplexer.subscribe(vi.fn());
    state.handlers?.emit(45);
    first.remove();
    await vi.advanceTimersByTimeAsync(STOP_DELAY_MS);

    const next = vi.fn();
    await multiplexer.subscribe(next);

    expect(state.starts).toBe(2);
    expect(next).not.toHaveBeenCalled();
  });

  it("外した購読には配らない", async () => {
    const { multiplexer, state } = setup();
    const removed = vi.fn();
    const kept = vi.fn();

    const subscription = await multiplexer.subscribe(removed);
    await multiplexer.subscribe(kept);
    subscription.remove();
    state.handlers?.emit(10);

    expect(removed).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledWith(10);
  });

  it("後から加わった購読には直近の方位をすぐに渡す", async () => {
    const { multiplexer, state } = setup();
    await multiplexer.subscribe(vi.fn());
    state.handlers?.emit(45);

    const late = vi.fn();
    await multiplexer.subscribe(late);

    expect(late).toHaveBeenCalledWith(45);
  });

  it("方位を [0, 360) に正規化し、不正な値は配らない", async () => {
    const { multiplexer, state } = setup();
    const listener = vi.fn();
    await multiplexer.subscribe(listener);

    state.handlers?.emit(370);
    state.handlers?.emit(Number.NaN);

    expect(listener.mock.calls).toEqual([[10]]);
  });

  it("開始に失敗したら reject し、次の購読で開始し直す", async () => {
    const { multiplexer, state } = setup({ failTimes: 1 });
    const failed = vi.fn();

    await expect(multiplexer.subscribe(failed)).rejects.toThrow("start failed");
    await expect(multiplexer.subscribe(vi.fn())).resolves.toBeDefined();
    state.handlers?.emit(20);

    expect(state.starts).toBe(2);
    expect(failed).not.toHaveBeenCalled();
  });

  describe("開始後の失敗（fail）", () => {
    it("null を配り、ネイティブの購読を捨て、後から加わる購読に古い方位を渡さない", async () => {
      const { multiplexer, state } = setup();
      const listener = vi.fn();
      await multiplexer.subscribe(listener);
      const failedHandlers = state.handlers!;
      failedHandlers.emit(45);

      failedHandlers.fail();
      await Promise.resolve();

      expect(listener.mock.calls).toEqual([[45], [null]]);
      expect(state.removes).toBe(1);

      const late = vi.fn();
      await multiplexer.subscribe(late);
      expect(late).not.toHaveBeenCalled();
      expect(state.starts).toBe(2);
    });

    it("開始し直したら、失敗の前から残っていたリスナーにも再び配る", async () => {
      const { multiplexer, state } = setup();
      const survivor = vi.fn();
      await multiplexer.subscribe(survivor);
      state.handlers!.fail();

      await multiplexer.subscribe(vi.fn());
      state.handlers!.emit(30);

      expect(survivor.mock.calls).toEqual([[null], [30]]);
    });

    it("停止の猶予中に失敗しても、止めるのは1回だけで、次の購読で開始し直す", async () => {
      const { multiplexer, state } = setup();
      const subscription = await multiplexer.subscribe(vi.fn());
      subscription.remove();
      state.handlers!.fail();
      await vi.advanceTimersByTimeAsync(STOP_DELAY_MS);

      expect(state.removes).toBe(1);
      await multiplexer.subscribe(vi.fn());
      expect(state.starts).toBe(2);
    });

    it("開始が終わる前に失敗が届いたら、購読は返すが古い方位は渡さず、開始の後に止める", async () => {
      let handlers: HeadingSourceHandlers | null = null;
      let resolveStart: (() => void) | null = null;
      const remove = vi.fn();
      const multiplexer = createHeadingMultiplexer(
        (h) =>
          new Promise((resolve) => {
            handlers = h;
            resolveStart = () => resolve({ remove });
          }),
        { stopDelayMs: STOP_DELAY_MS },
      );
      const listener = vi.fn();
      const pending = multiplexer.subscribe(listener);

      handlers!.emit(45);
      handlers!.fail();
      resolveStart!();
      await expect(pending).resolves.toBeDefined();
      await Promise.resolve();

      expect(listener.mock.calls).toEqual([[45], [null]]);
      expect(remove).toHaveBeenCalledTimes(1);
    });

    it("捨てた購読から後で届く emit・fail は無視する", async () => {
      const { multiplexer, state } = setup();
      const listener = vi.fn();
      await multiplexer.subscribe(listener);
      const stale = state.handlers!;
      stale.fail();
      await multiplexer.subscribe(vi.fn());

      stale.emit(90);
      stale.fail();

      expect(listener.mock.calls).toEqual([[null]]);
      expect(state.removes).toBe(1);
    });
  });
});

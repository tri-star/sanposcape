import { describe, expect, it, vi } from "vitest";

import { createHeadingMultiplexer } from "@/services/location/headingMultiplexer";
import type { HeadingListener } from "@/services/location/types";

/** 開始・停止の回数を数え、`emit` を外から呼べるネイティブ購読のフェイク。 */
function createFakeSource(options?: { failTimes?: number }) {
  let failTimes = options?.failTimes ?? 0;
  const state = { starts: 0, removes: 0, emit: null as HeadingListener | null };
  const start = vi.fn(async (emit: HeadingListener) => {
    state.starts += 1;
    if (failTimes > 0) {
      failTimes -= 1;
      throw new Error("start failed");
    }
    state.emit = emit;
    return {
      remove() {
        state.removes += 1;
      },
    };
  });
  return { start, state };
}

describe("createHeadingMultiplexer", () => {
  it("複数の購読でもネイティブの購読は1本だけ始め、全員に配る", async () => {
    const { start, state } = createFakeSource();
    const multiplexer = createHeadingMultiplexer(start);
    const a = vi.fn();
    const b = vi.fn();

    await Promise.all([multiplexer.subscribe(a), multiplexer.subscribe(b)]);
    state.emit?.(90);

    expect(state.starts).toBe(1);
    expect(a).toHaveBeenCalledWith(90);
    expect(b).toHaveBeenCalledWith(90);
  });

  it("最後の購読を外したときだけネイティブの購読を止める", async () => {
    const { start, state } = createFakeSource();
    const multiplexer = createHeadingMultiplexer(start);

    const first = await multiplexer.subscribe(vi.fn());
    const second = await multiplexer.subscribe(vi.fn());
    first.remove();
    await Promise.resolve();
    expect(state.removes).toBe(0);

    second.remove();
    second.remove(); // 二重に呼んでも安全
    await Promise.resolve();
    expect(state.removes).toBe(1);
  });

  it("外した購読には配らない", async () => {
    const { start, state } = createFakeSource();
    const multiplexer = createHeadingMultiplexer(start);
    const removed = vi.fn();
    const kept = vi.fn();

    const subscription = await multiplexer.subscribe(removed);
    await multiplexer.subscribe(kept);
    subscription.remove();
    state.emit?.(10);

    expect(removed).not.toHaveBeenCalled();
    expect(kept).toHaveBeenCalledWith(10);
  });

  it("後から加わった購読には直近の方位をすぐに渡す", async () => {
    const { start, state } = createFakeSource();
    const multiplexer = createHeadingMultiplexer(start);
    await multiplexer.subscribe(vi.fn());
    state.emit?.(45);

    const late = vi.fn();
    await multiplexer.subscribe(late);

    expect(late).toHaveBeenCalledWith(45);
  });

  it("止めた後に購読し直すと、前回の方位は渡さず開始し直す", async () => {
    const { start, state } = createFakeSource();
    const multiplexer = createHeadingMultiplexer(start);
    const first = await multiplexer.subscribe(vi.fn());
    state.emit?.(45);
    first.remove();

    const next = vi.fn();
    await multiplexer.subscribe(next);

    expect(state.starts).toBe(2);
    expect(next).not.toHaveBeenCalled();
  });

  it("方位を [0, 360) に正規化し、不正な値は配らない", async () => {
    const { start, state } = createFakeSource();
    const multiplexer = createHeadingMultiplexer(start);
    const listener = vi.fn();
    await multiplexer.subscribe(listener);

    state.emit?.(370);
    state.emit?.(Number.NaN);

    expect(listener.mock.calls).toEqual([[10]]);
  });

  it("開始に失敗したら reject し、次の購読で開始し直す", async () => {
    const { start, state } = createFakeSource({ failTimes: 1 });
    const multiplexer = createHeadingMultiplexer(start);
    const failed = vi.fn();

    await expect(multiplexer.subscribe(failed)).rejects.toThrow("start failed");
    await expect(multiplexer.subscribe(vi.fn())).resolves.toBeDefined();
    state.emit?.(20);

    expect(state.starts).toBe(2);
    expect(failed).not.toHaveBeenCalled();
  });
});

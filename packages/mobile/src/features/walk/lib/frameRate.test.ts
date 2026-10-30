import { describe, expect, it } from "vitest";

import {
  createFrameRateWindow,
  type FrameRateWindow,
  tickFrameRateWindow,
} from "@/features/walk/lib/frameRate";

const START = 10_000;

/** `intervalMs` ごとに `count` フレームを刻み、窓が閉じたときの FPS を順に返す。 */
function runFrames(count: number, intervalMs: number): number[] {
  let window: FrameRateWindow = createFrameRateWindow(START);
  const reported: number[] = [];
  for (let i = 1; i <= count; i++) {
    const result = tickFrameRateWindow(window, START + i * intervalMs);
    window = result.window;
    if (result.fps !== null) reported.push(result.fps);
  }
  return reported;
}

describe("tickFrameRateWindow", () => {
  it("窓が閉じるまでは FPS を返さず、フレームを積む", () => {
    const first = tickFrameRateWindow(createFrameRateWindow(START), START + 16);
    expect(first.fps).toBeNull();
    expect(first.window).toEqual({ startedAtMs: START, frames: 1 });
  });

  it("1秒たった時点で、その窓のフレーム数から FPS を返し、窓を数え直す", () => {
    const window: FrameRateWindow = { startedAtMs: START, frames: 59 };
    const result = tickFrameRateWindow(window, START + 1000);
    expect(result.fps).toBe(60);
    expect(result.window).toEqual({ startedAtMs: START + 1000, frames: 0 });
  });

  it("60fps 相当の間隔なら毎秒 60 前後を返す", () => {
    expect(runFrames(180, 1000 / 60)).toEqual([60, 60, 60]);
  });

  it("フレームが遅れて窓が長くなっても、実際の経過時間で割る", () => {
    // 1フレームが 250ms かかる（JS が詰まっている）と、4フレーム目で窓が閉じて 4fps。
    expect(runFrames(4, 250)).toEqual([4]);
    // 1フレームで 2 秒止まったら 0.5fps → 丸めて 1。
    expect(tickFrameRateWindow(createFrameRateWindow(START), START + 2000).fps).toBe(1);
  });

  it("窓の長さを指定できる", () => {
    const result = tickFrameRateWindow({ startedAtMs: START, frames: 29 }, START + 500, 500);
    expect(result.fps).toBe(60);
  });
});

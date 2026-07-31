import { describe, expect, it } from "vitest";

import {
  createWalkClock,
  elapsedSeconds,
  isPaused,
  pauseWalkClock,
  resumeWalkClock,
} from "@/features/walk/lib/walkElapsed";

const START = 1_000_000;

describe("elapsedSeconds", () => {
  it("開始直後は経過0秒", () => {
    const clock = createWalkClock(START);
    expect(elapsedSeconds(clock, START)).toBe(0);
  });

  it("1000ms 経過で1秒になる", () => {
    const clock = createWalkClock(START);
    expect(elapsedSeconds(clock, START + 1000)).toBe(1);
  });

  it("pause 中は増えない", () => {
    const clock = pauseWalkClock(createWalkClock(START), START + 3000);
    expect(elapsedSeconds(clock, START + 3000)).toBe(3);
    expect(elapsedSeconds(clock, START + 10_000)).toBe(3);
  });

  it("pause→resume で停止分が除かれる", () => {
    let clock = createWalkClock(START);
    clock = pauseWalkClock(clock, START + 3000);
    clock = resumeWalkClock(clock, START + 8000); // 5秒停止
    expect(elapsedSeconds(clock, START + 9000)).toBe(4); // 9000-8000+3000 = 4000ms active
  });

  it("pause の冪等性（2回呼んでも同一 state）", () => {
    const clock = createWalkClock(START);
    const paused = pauseWalkClock(clock, START + 1000);
    const pausedAgain = pauseWalkClock(paused, START + 5000);
    expect(pausedAgain).toBe(paused);
  });

  it("resume の冪等性（動作中に resume しても同一 state）", () => {
    const clock = createWalkClock(START);
    const resumed = resumeWalkClock(clock, START + 5000);
    expect(resumed).toBe(clock);
  });

  it("startedAtMs より前の nowMs でも負にならない", () => {
    const clock = createWalkClock(START);
    expect(elapsedSeconds(clock, START - 10_000)).toBe(0);
  });

  it("isPaused が状態を正しく反映する", () => {
    const clock = createWalkClock(START);
    expect(isPaused(clock)).toBe(false);
    expect(isPaused(pauseWalkClock(clock, START + 1000))).toBe(true);
  });
});

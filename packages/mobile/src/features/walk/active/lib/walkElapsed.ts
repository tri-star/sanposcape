export type WalkClock = {
  startedAtMs: number;
  /** これまでに一時停止していた累計（ms）。 */
  pausedTotalMs: number;
  /** 一時停止中ならその開始時刻。動作中は null。 */
  pausedAtMs: number | null;
};

/** 経過ゼロの新しい時計を作る。 */
export function createWalkClock(startedAtMs: number): WalkClock {
  return { startedAtMs, pausedTotalMs: 0, pausedAtMs: null };
}

/**
 * 経過秒（実時刻 − 一時停止していた時間）を求める。
 * setInterval のカウントアップだと、画面のアンマウント／端末スリープで時間がずれるため、
 * 常に「今の時刻」から差分計算する。
 */
export function elapsedSeconds(clock: WalkClock, nowMs: number): number {
  const currentPauseMs = clock.pausedAtMs === null ? 0 : nowMs - clock.pausedAtMs;
  const activeMs = nowMs - clock.startedAtMs - clock.pausedTotalMs - currentPauseMs;
  return Math.max(0, Math.floor(activeMs / 1000));
}

export function isPaused(clock: WalkClock): boolean {
  return clock.pausedAtMs !== null;
}

/** 一時停止する。既に停止中なら同一 state を返す（冪等）。 */
export function pauseWalkClock(clock: WalkClock, nowMs: number): WalkClock {
  if (isPaused(clock)) {
    return clock;
  }
  return { ...clock, pausedAtMs: nowMs };
}

/** 再開する。既に動作中なら同一 state を返す（冪等）。 */
export function resumeWalkClock(clock: WalkClock, nowMs: number): WalkClock {
  if (!isPaused(clock)) {
    return clock;
  }
  const pausedAtMs = clock.pausedAtMs as number;
  return {
    startedAtMs: clock.startedAtMs,
    pausedTotalMs: clock.pausedTotalMs + (nowMs - pausedAtMs),
    pausedAtMs: null,
  };
}

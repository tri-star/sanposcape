/** FPS を数える窓の長さ（ms）。表示は窓ごとに1回だけ更新する（毎フレーム再描画しない。SS-229）。 */
export const FRAME_RATE_WINDOW_MS = 1000;

/** 数えている途中の窓。`startedAtMs` からのフレーム数を `frames` に積む。 */
export type FrameRateWindow = {
  startedAtMs: number;
  frames: number;
};

export function createFrameRateWindow(nowMs: number): FrameRateWindow {
  return { startedAtMs: nowMs, frames: 0 };
}

/**
 * 1フレームを数える。窓の長さ（`windowMs`）以上たったら、その窓の FPS（整数に丸める）を返し、
 * 窓を `nowMs` から数え直す。窓が閉じていなければ `fps` は null。
 * 経過時間は実時刻の差で割るので、窓が `windowMs` より長くなっても（JS が詰まってフレームが遅れても）FPS はずれない。
 */
export function tickFrameRateWindow(
  window: FrameRateWindow,
  nowMs: number,
  windowMs: number = FRAME_RATE_WINDOW_MS,
): { window: FrameRateWindow; fps: number | null } {
  const frames = window.frames + 1;
  const elapsedMs = nowMs - window.startedAtMs;
  if (elapsedMs < windowMs) {
    return { window: { startedAtMs: window.startedAtMs, frames }, fps: null };
  }
  return { window: createFrameRateWindow(nowMs), fps: Math.round((frames * 1000) / elapsedMs) };
}

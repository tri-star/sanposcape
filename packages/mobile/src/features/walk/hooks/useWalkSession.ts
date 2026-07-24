import { useCallback, useEffect, useRef, useState } from "react";

export type UseWalkSessionResult = {
  elapsedSec: number;
  paused: boolean;
  togglePause: () => void;
  reset: () => void;
};

/**
 * 散歩中の経過秒タイマーと一時停止。
 * `paused` 中は加算しない。整形（`formatClock` 等）は持たず、表示側に任せる。
 */
export function useWalkSession(initialElapsedSec = 0): UseWalkSessionResult {
  const [elapsedSec, setElapsedSec] = useState(initialElapsedSec);
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    const interval = setInterval(() => {
      if (!pausedRef.current) {
        setElapsedSec((prev) => prev + 1);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const togglePause = useCallback(() => setPaused((prev) => !prev), []);
  const reset = useCallback(() => {
    setElapsedSec(initialElapsedSec);
    setPaused(false);
  }, [initialElapsedSec]);

  return { elapsedSec, paused, togglePause, reset };
}

import { useCallback, useEffect, useState } from "react";

import {
  createWalkClock,
  elapsedSeconds,
  isPaused,
  pauseWalkClock,
  resumeWalkClock,
} from "@/features/walk/lib/walkElapsed";
import type { WalkClock } from "@/features/walk/lib/walkElapsed";

export type UseWalkSessionResult = {
  elapsedSec: number;
  paused: boolean;
  togglePause: () => void;
};

/**
 * 散歩の経過時間。実時刻（startedAtMs）から算出するため、
 * 画面の再マウントや端末スリープでもずれない。計算は lib/walkElapsed.ts の純粋関数に委譲する。
 */
export function useWalkSession(startedAtMs: number): UseWalkSessionResult {
  const [clock, setClock] = useState<WalkClock>(() => createWalkClock(startedAtMs));
  const [nowMs, setNowMs] = useState(() => Date.now());

  // 別の散歩が始まったら（startedAtMs が変わったら）時計を作り直す。
  // effect ではなくレンダー中に更新する（React 公式の「props 変更時に state を調整する」手法）。
  // effect でやると「前の散歩の経過時間を表示した 1 フレーム」を挟んでしまうが、
  // レンダー中なら React が DOM を確定させる前にもう一度レンダーし直すためちらつかない。
  // 「今どの散歩の時計か」は clock.startedAtMs が持っているので、比較用の state は要らない
  // （pause / resume は startedAtMs を保存するため、この不変条件は崩れない）。
  if (clock.startedAtMs !== startedAtMs) {
    setClock(createWalkClock(startedAtMs));
  }

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const togglePause = useCallback(() => {
    setClock((prev) =>
      isPaused(prev) ? resumeWalkClock(prev, Date.now()) : pauseWalkClock(prev, Date.now()),
    );
  }, []);

  return {
    elapsedSec: elapsedSeconds(clock, nowMs),
    paused: isPaused(clock),
    togglePause,
  };
}

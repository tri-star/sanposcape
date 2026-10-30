import { useEffect, useState } from "react";

import {
  createFrameRateWindow,
  type FrameRateWindow,
  tickFrameRateWindow,
} from "@/features/walk/lib/frameRate";

/**
 * JS スレッドの FPS（`requestAnimationFrame` が1秒に何回呼ばれたか）を返す。最初の1秒は null。
 * 表示の更新は1秒に1回だけ（毎フレーム setState しない）。マウントしている間だけ数えるので、
 * 計測を止めたいときは呼び出し側がこのフックを持つコンポーネントをアンマウントする（SS-229）。
 * RN 依存の副作用層なので Vitest 対象外（計算は lib/frameRate.ts）。
 */
export function useJsFrameRate(): number | null {
  const [fps, setFps] = useState<number | null>(null);

  useEffect(() => {
    let window: FrameRateWindow = createFrameRateWindow(performance.now());
    let handle = requestAnimationFrame(function onFrame() {
      const result = tickFrameRateWindow(window, performance.now());
      window = result.window;
      if (result.fps !== null) setFps(result.fps);
      handle = requestAnimationFrame(onFrame);
    });
    return () => cancelAnimationFrame(handle);
  }, []);

  return fps;
}

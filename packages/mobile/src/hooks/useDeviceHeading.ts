import { useIsFocused } from "expo-router";
import { useEffect, useState } from "react";
import { AppState } from "react-native";

import { quantizeHeadingDegrees } from "@/lib/heading";
import { describeError, logDiagnostic } from "@/lib/diagnosticLog";
import { locationService } from "@/services/location";
import type { LocationSubscription } from "@/services/location/types";

/**
 * 方位を丸める刻み（度）。センサーは止まっていても数度揺れるので、刻みが変わったときだけ再描画する。
 * 扇形の開き（`HEADING_BEAM_SPREAD_DEGREES`）より十分小さければ、向きのずれは見て分からない。
 */
const HEADING_STEP_DEGREES = 5;

/**
 * 端末の向き（方位。北を 0 とした時計回りの度数）を返す hook（SS-169）。取れない間は null。
 *
 * - `enabled` かつ画面にフォーカスがあり、アプリが前面にいる間だけ購読する（タブは裏でもマウントされたままなので、
 *   見えていない地図のためにセンサーを回さない。iOS は背景の位置記録中だと背面でも方位が届きうる）。
 * - 権限はリクエストしない。現在地を描けている（= 権限がある）ときに `enabled` を立てる前提。
 * - 開始に失敗しても画面は止めない（向きを出さないだけ。原因調査用に診断ログを残す）。
 */
export function useDeviceHeading(enabled: boolean): number | null {
  const isFocused = useIsFocused();
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === "active");
  const [heading, setHeading] = useState<number | null>(null);
  const active = enabled && isFocused && isAppActive;

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setIsAppActive(state === "active");
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let subscription: LocationSubscription | null = null;

    locationService
      .watchHeading((degrees) => {
        if (!cancelled) setHeading(quantizeHeadingDegrees(degrees, HEADING_STEP_DEGREES));
      })
      .then((started) => {
        if (cancelled) started.remove();
        else subscription = started;
      })
      .catch((error: unknown) => {
        if (!cancelled) logDiagnostic("location_heading_watch_failed", describeError(error));
      });

    return () => {
      cancelled = true;
      subscription?.remove();
      // 次に購読し直したとき、止める前の古い向きを出さない。
      setHeading(null);
    };
  }, [active]);

  return active ? heading : null;
}

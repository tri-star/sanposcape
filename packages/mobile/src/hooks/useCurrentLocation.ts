import { useCallback, useEffect, useRef, useState } from "react";

import { locationService } from "@/services/location";
import { toLocationError } from "@/services/location/locationError";
import type {
  GeoCoordinates,
  LocationErrorCode,
  LocationPermissionStatus,
} from "@/services/location/types";

export type UseCurrentLocationResult = {
  coordinates: GeoCoordinates | null;
  permission: LocationPermissionStatus;
  isLoading: boolean;
  errorCode: LocationErrorCode | null;
  /** 権限リクエスト → 現在地取得をやり直す。 */
  retry: () => void;
  /**
   * 現在地だけを静かに取り直す。`retry` と違い `isLoading` を立てず `errorCode` も先にクリアしない
   * ので、常駐する画面（ピンタブ）がフォーカスを取り戻したときに表示が点滅しない。
   * 結果（成功・失敗）は取得完了時に反映される。
   */
  refresh: () => void;
};

/**
 * 現在地取得の hook。
 * `@/services/location` の `locationService` のみを参照し、real/mock の実体を知らない。
 *
 * 配置について: `features/walk`（散歩開始画面の `useWalkPlan`）と `features/pin`（地点選択画面の
 * `usePinLocationPicker`。SS-124）から使うため `src/hooks/` に置く（`docs/folder-structure.md` の
 * 昇格ルール）。
 */
export function useCurrentLocation(): UseCurrentLocationResult {
  const [coordinates, setCoordinates] = useState<GeoCoordinates | null>(null);
  const [permission, setPermission] = useState<LocationPermissionStatus>("undetermined");
  const [isLoading, setIsLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<LocationErrorCode | null>(null);
  const [attempt, setAttempt] = useState(0);

  // 次の取得を静かに行うか（isLoading/errorCode を先に触らない）。effect が読んで即座に戻す。
  const silentRef = useRef(false);

  const retry = useCallback(() => {
    setAttempt((prev) => prev + 1);
  }, []);

  const refresh = useCallback(() => {
    silentRef.current = true;
    setAttempt((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const silent = silentRef.current;
    silentRef.current = false;

    async function resolveLocation() {
      if (!silent) {
        setIsLoading(true);
        setErrorCode(null);
      }

      try {
        let status = await locationService.getPermissionStatus();
        if (status === "undetermined") {
          status = await locationService.requestPermission();
        }
        if (cancelled) return;
        setPermission(status);

        if (status !== "granted") {
          setErrorCode("permission_denied");
          setCoordinates(null);
          return;
        }

        const position = await locationService.getCurrentPosition();
        if (cancelled) return;
        setCoordinates(position);
        // 静かな取り直しで成功したら、前回の失敗表示を消す。
        setErrorCode(null);
      } catch (error) {
        if (cancelled) return;
        setErrorCode(toLocationError(error).code);
        setCoordinates(null);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void resolveLocation();

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { coordinates, permission, isLoading, errorCode, retry, refresh };
}

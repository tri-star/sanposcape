import { useCallback, useEffect, useState } from "react";

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
};

/**
 * 現在地取得の hook。
 * `@/services/location` の `locationService` のみを参照し、real/mock の実体を知らない。
 *
 * 配置について: `walk` 以外から使われるまでは `features/walk/hooks/` に置く
 * （`docs/folder-structure.md` の「迷ったらまず features/」）。SS-16 で散歩中画面からも
 * 使うことになったら `src/hooks/` へ昇格を検討する。
 */
export function useCurrentLocation(): UseCurrentLocationResult {
  const [coordinates, setCoordinates] = useState<GeoCoordinates | null>(null);
  const [permission, setPermission] = useState<LocationPermissionStatus>("undetermined");
  const [isLoading, setIsLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<LocationErrorCode | null>(null);
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback(() => {
    setAttempt((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function resolveLocation() {
      setIsLoading(true);
      setErrorCode(null);

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

  return { coordinates, permission, isLoading, errorCode, retry };
}

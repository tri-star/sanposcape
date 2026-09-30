import { useCallback, useEffect, useState } from "react";

import { shouldSkipSilentRefresh } from "@/lib/locationRefreshPolicy";
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
  /**
   * 現在の `coordinates` が静かな取り直し（`refresh`）で得たものか。初回・`retry` で得たものは false。
   * 「フォールバック表示から現在地が取れたら自動で移動する」側が、ユーザーが見ている場所を
   * 奪わないために使う（SS-146）。
   */
  coordinatesFromRefresh: boolean;
  /** 権限リクエスト → 現在地取得をやり直す。 */
  retry: () => void;
  /**
   * 現在地だけを静かに取り直す。`retry` と違い `isLoading` を立てず `errorCode` も先にクリアせず、
   * 権限もリクエストしない（未決定なら何もしない）。取得に失敗しても直前の座標と `errorCode` を
   * 保持する（権限が取り消されていた場合だけ案内のため反映する）。直近 30 秒以内に取得できていれば
   * 何もしない（`LOCATION_REFRESH_MIN_INTERVAL_MS`）。取得中の呼び出しも何もしないので、
   * 同じ tick の `retry`（ユーザー操作）が常に勝つ。常駐する画面（ピンタブ）が
   * フォーカスを取り戻したときに表示が点滅しない。
   */
  refresh: () => void;
};

/** 取得リクエスト。リクエストごとにモード（silent）を持たせる（ref 経由にしない）。 */
type LocationRequest = {
  /** リクエスト番号。変わるたびに取得をやり直す。 */
  n: number;
  /** 静かな取り直しか。 */
  silent: boolean;
  /** このリクエストが完了したか（成功・失敗とも）。 */
  settled: boolean;
  /** 直近に現在地を取得できた時刻（ミリ秒）。 */
  fetchedAt: number | null;
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
  const [coordinatesFromRefresh, setCoordinatesFromRefresh] = useState(false);
  const [permission, setPermission] = useState<LocationPermissionStatus>("undetermined");
  const [isLoading, setIsLoading] = useState(true);
  const [errorCode, setErrorCode] = useState<LocationErrorCode | null>(null);
  const [request, setRequest] = useState<LocationRequest>({
    n: 0,
    silent: false,
    settled: false,
    fetchedAt: null,
  });

  const retry = useCallback(() => {
    setRequest((prev) => ({ ...prev, n: prev.n + 1, silent: false, settled: false }));
  }, []);

  const refresh = useCallback(() => {
    setRequest((prev) => {
      // 取得中（初回・retry・別の refresh）は何もしない。同じ tick の retry が silent に上書きされない。
      if (!prev.settled) return prev;
      if (shouldSkipSilentRefresh({ lastFetchedAt: prev.fetchedAt, now: Date.now() })) return prev;
      return { ...prev, n: prev.n + 1, silent: true, settled: false };
    });
  }, []);

  const { n: requestN, silent } = request;

  useEffect(() => {
    let cancelled = false;

    async function resolveLocation() {
      if (!silent) {
        setIsLoading(true);
        setErrorCode(null);
      }
      let succeeded = false;

      try {
        let status = await locationService.getPermissionStatus();
        if (status === "undetermined") {
          // 静かな取り直しでは権限ダイアログを出さない。既存の状態を保持して終わる。
          if (silent) return;
          status = await locationService.requestPermission();
        }
        if (cancelled) return;
        setPermission(status);

        if (status !== "granted") {
          setErrorCode("permission_denied");
          setCoordinates(null);
          setCoordinatesFromRefresh(false);
          return;
        }

        const position = await locationService.getCurrentPosition();
        if (cancelled) return;
        setCoordinates(position);
        setCoordinatesFromRefresh(silent);
        // 静かな取り直しで成功したら、前回の失敗表示を消す。
        setErrorCode(null);
        succeeded = true;
      } catch (error) {
        if (cancelled) return;
        // 静かな取り直しの失敗は画面を変えない（直前の座標と errorCode を保持する）。
        if (silent) return;
        setErrorCode(toLocationError(error).code);
        setCoordinates(null);
        setCoordinatesFromRefresh(false);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setRequest((prev) =>
            prev.n === requestN
              ? { ...prev, settled: true, fetchedAt: succeeded ? Date.now() : prev.fetchedAt }
              : prev,
          );
        }
      }
    }

    void resolveLocation();

    return () => {
      cancelled = true;
    };
  }, [requestN, silent]);

  return { coordinates, permission, isLoading, errorCode, coordinatesFromRefresh, retry, refresh };
}

import { keepPreviousData, useQueries } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";

import { fetchPinsInBounds } from "@/features/pin/api/pinReadApi";
import { useSanpoMaps } from "@/features/pin/hooks/useSanpoMaps";
import { resolvePinFetchBounds } from "@/features/pin/lib/pinFetchBounds";
import { pinListQueryKey } from "@/features/pin/lib/pinQueryKeys";
import { mergeRegisteredPinPages } from "@/features/pin/lib/pinRead";
import { toPinReadErrorCode, type PinReadErrorCode } from "@/features/pin/lib/pinReadError";
import type { GeoBounds, PinSummary } from "@/features/pin/types";
import type { MapRegion } from "@/lib/mapRegion";

/** サーバー状態の鮮度（表示範囲を動かさない限りは取り直さない）。 */
const STALE_TIME_MS = 60_000;
const GC_TIME_MS = 10 * 60_000;
/** `fetchBounds` が未確定のあいだだけ使うプレースホルダ（`enabled: false` なので実際には通信されない）。 */
const UNRESOLVED_BOUNDS: GeoBounds = { south: 0, north: 0, west: 0, east: 0 };

export type UseRegisteredPinsResult = {
  pins: PinSummary[];
  /** "loading": 取得範囲の確定前・地図一覧の取得中・初回取得中（表示できるピンがまだ無い）。 */
  status: "loading" | "ready" | "error";
  errorCode: PinReadErrorCode | null;
  truncated: boolean;
  retry: () => void;
};

export type UseRegisteredPinsOptions = {
  visibleRegion: MapRegion | null;
  /** ルートから注入（サインイン済み && pin_registration ON）。false なら一切通信しない。 */
  enabled: boolean;
};

/**
 * 表示範囲内の登録済みピンを、member であるすべての地図から取得する（SS-118）。
 * 判定は `lib/pinFetchBounds.ts` / `lib/pinRead.ts` に任せ、この hook は状態の保持と配線だけ
 * （`usePinLocationPicker` と同じ設計方針）。
 *
 * 表示範囲内のピンが上限（`PIN_MAP_FETCH_LIMIT`）を超えてもページングは続けない
 * （ルート ADR-009 の持ち越しの決着。mobile ADR-012 D3）。
 */
export function useRegisteredPins(options: UseRegisteredPinsOptions): UseRegisteredPinsResult {
  const maps = useSanpoMaps({ enabled: options.enabled });

  const [fetchBounds, setFetchBounds] = useState<GeoBounds | null>(null);
  const [currentTruncated, setCurrentTruncated] = useState(false);

  // 表示範囲・現在の取得範囲から「取り直すべきか」を毎レンダー判定する。返り値が
  // `fetchBounds` と別参照のときだけ setState する（React 公式の「レンダー中に state を
  // 直接調整する」パターン。`usePinLocationPicker.ts` と同じ理由で useEffect にしない）。
  // 新しい範囲は必ず表示範囲を含み、かつ直後は containsBounds を満たすため、次のレンダーでは
  // この分岐を通らなくなる（無限ループにならない）。
  const resolvedBounds = resolvePinFetchBounds({
    visibleRegion: options.visibleRegion,
    current: fetchBounds,
    currentTruncated,
  });
  if (resolvedBounds !== fetchBounds) {
    setFetchBounds(resolvedBounds);
  }

  const queries = useQueries({
    queries: maps.maps.map((map) => ({
      queryKey: pinListQueryKey(map.id, fetchBounds ?? UNRESOLVED_BOUNDS),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchPinsInBounds(
          { sanpoMapId: map.id, bounds: fetchBounds ?? UNRESOLVED_BOUNDS },
          { signal },
        ),
      // 一時障害の再送は customFetch の transientRetry が既に行うため重ねない。
      retry: false,
      enabled: options.enabled && fetchBounds !== null,
      placeholderData: keepPreviousData,
      staleTime: STALE_TIME_MS,
      gcTime: GC_TIME_MS,
    })),
  });

  const merged = useMemo(
    () => mergeRegisteredPinPages(queries.map((query) => query.data)),
    [queries],
  );

  // 「打ち切られているか」は現在の fetchBounds に対する結果（プレースホルダではない）だけから
  // 求める。プレースホルダ中の値を見ると、パン直後の一瞬だけ古い bounds の truncated が
  // 新しい bounds に紛れ込みうるため isPlaceholderData を除く。
  const settledTruncated = queries.some(
    (query) => query.data !== undefined && !query.isPlaceholderData && query.data.hasMore,
  );
  if (fetchBounds !== null && settledTruncated !== currentTruncated) {
    setCurrentTruncated(settledTruncated);
  }

  const anyQueryPending = queries.some((query) => query.isPending);
  const firstError = queries.find((query) => query.isError)?.error;

  const status: UseRegisteredPinsResult["status"] = !options.enabled
    ? "ready"
    : maps.status === "error"
      ? "error"
      : maps.status === "loading" || fetchBounds === null || anyQueryPending
        ? "loading"
        : firstError !== undefined
          ? "error"
          : "ready";

  const errorCode: PinReadErrorCode | null =
    status !== "error"
      ? null
      : firstError !== undefined
        ? toPinReadErrorCode(firstError)
        : "unknown";

  const { retry: retryMaps } = maps;
  const retry = useCallback(() => {
    retryMaps();
    for (const query of queries) {
      void query.refetch();
    }
    // `queries`（useQueries の戻り値）は毎レンダー新しい配列になるため依存配列には含めない。
    // eslint-disable-next-line react-hooks/exhaustive-deps -- queries は最新のクロージャ内の値を使うだけでよい
  }, [retryMaps]);

  return {
    pins: merged.pins,
    status,
    errorCode,
    truncated: merged.truncated,
    retry,
  };
}

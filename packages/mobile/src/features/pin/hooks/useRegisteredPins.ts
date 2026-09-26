import { keepPreviousData, useQueries } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { fetchPinsInBounds } from "@/features/pin/api/pinReadApi";
import { useSanpoMaps } from "@/features/pin/hooks/useSanpoMaps";
import { resolvePinFetchBounds } from "@/features/pin/lib/pinFetchBounds";
import { pinListQueryKey } from "@/features/pin/lib/pinQueryKeys";
import { combineRegisteredPinListQueries } from "@/features/pin/lib/pinRead";
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

  // `combine` にはモジュールレベルの安定した関数参照（`combineRegisteredPinListQueries`）を渡す。
  // クエリの実データが変わらない限り戻り値（`pins` を含む）の参照が安定するため、
  // `WalkActiveView` の毎秒の再レンダーで `RegisteredPinMarkers` の `React.memo` が
  // 無効化されない（SS-118 ローカルレビュー ARCH-W1。詳細は `pinRead.ts` の JSDoc）。
  const combined = useQueries({
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
    combine: combineRegisteredPinListQueries,
  });

  // 「打ち切られているか」は現在の fetchBounds に対する結果（プレースホルダではない）だけから
  // 求める（`combineRegisteredPinListQueries` の `settledTruncated` の JSDoc を参照）。
  if (fetchBounds !== null && combined.settledTruncated !== currentTruncated) {
    setCurrentTruncated(combined.settledTruncated);
  }

  const status: UseRegisteredPinsResult["status"] = !options.enabled
    ? "ready"
    : maps.status === "error"
      ? "error"
      : maps.status === "loading" || fetchBounds === null || combined.anyPending
        ? "loading"
        : combined.firstError !== undefined
          ? "error"
          : "ready";

  // `toPinReadErrorCode` の 400→invalid_cursor は本来「写真ページ（`GET /pins/{id}/photos`）」
  // 前提の分類（`pinReadError.ts` 参照）。ここで分類対象になる `firstError` は `GET /pins`
  // （一覧）の失敗で、mobile はこの一覧取得に `cursor` を送らないため 400 が実際に発生することは
  // 想定していない。万一 backend 側の事情で 400 が返っても "invalid_cursor" に分類されるが、
  // 表示文言（「写真の読み込み位置が古くなりました」）はこの文脈には合わない。呼び出し元を
  // 限定するほどの実害は無いと判断し、分類自体は変えていない（SS-118 ローカルレビュー QA-S3）。
  const errorCode: PinReadErrorCode | null =
    status !== "error"
      ? null
      : combined.firstError !== undefined
        ? toPinReadErrorCode(combined.firstError)
        : "unknown";

  const { retry: retryMaps } = maps;
  const { refetchAll } = combined;
  const retry = useCallback(() => {
    retryMaps();
    refetchAll();
  }, [retryMaps, refetchAll]);

  return {
    pins: combined.pins,
    status,
    errorCode,
    truncated: combined.truncated,
    retry,
  };
}

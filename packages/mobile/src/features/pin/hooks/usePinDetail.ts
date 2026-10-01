import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";

import { getApiBaseUrl } from "@/config/env";
import { fetchPinDetail, fetchPinPhotoPage } from "@/features/pin/api/pinReadApi";
import {
  resolveIsLoadingMorePhotos,
  resolvePinDetailPhotos,
  shouldRefreshPhotoUrls,
} from "@/features/pin/lib/pinDetailState";
import { pinDetailQueryKey, pinPhotosQueryKey } from "@/features/pin/lib/pinQueryKeys";
import { toPinReadErrorCode, type PinReadErrorCode } from "@/features/pin/lib/pinReadError";
import type { PinDetail, PinPhoto } from "@/features/pin/types";

/**
 * 保存済みのピンは（このセッション内では）ほぼ不変。presigned URL の TTL（3600秒）より
 * 十分短くすることで、再訪時に URL を取り直す（ADR-M-012 D7）。
 */
const DETAIL_STALE_TIME_MS = 5 * 60_000;
const DETAIL_GC_TIME_MS = 30 * 60_000;

export type UsePinDetailResult = {
  pin: PinDetail | null;
  isLoading: boolean;
  /** 詳細の（再）取得中。編集画面が、再取得の完了を待ってから基準値を確定するために使う。 */
  isFetching: boolean;
  errorCode: PinReadErrorCode | null;
  retry: () => void;
  /** グリッド・拡大表示に使う写真（`resolvePinDetailPhotos` の結果）。 */
  photos: PinPhoto[];
  /** 写真の総数（件数表示・ビューアの分母）。写真ページを取得済みなら最新ページの値。 */
  photoCount: number;
  hasMorePhotos: boolean;
  isLoadingMorePhotos: boolean;
  /** 写真ページの取得失敗（詳細本体は表示できている）。 */
  photosErrorCode: PinReadErrorCode | null;
  loadMorePhotos: () => void;
  /** 画像の読み込みに失敗したときに呼ぶ（URL の失効の可能性。`shouldRefreshPhotoUrls` で間引く）。 */
  handlePhotoLoadError: () => void;
};

/**
 * ピン詳細画面のサーバー状態（詳細 + 写真のページング + URL の取り直し）。
 *
 * 最初の10件は `GET /pins/{id}` の `photos` をそのまま使い、`GET /pins/{id}/photos` は
 * 「もっと見る」を押したときだけ呼ぶ（写真が10件以下のピンでは往復を1回に抑える。
 * ADR-M-012 D6）。
 */
export function usePinDetail(
  pinId: string | null,
  options: { enabled: boolean },
): UsePinDetailResult {
  const queryClient = useQueryClient();
  const enabled = options.enabled && pinId !== null;
  const apiBaseUrl = getApiBaseUrl();

  const detailQuery = useQuery({
    queryKey: pinDetailQueryKey(pinId ?? ""),
    queryFn: ({ signal }) => fetchPinDetail(pinId as string, { signal, apiBaseUrl }),
    enabled,
    staleTime: DETAIL_STALE_TIME_MS,
    gcTime: DETAIL_GC_TIME_MS,
    retry: false,
  });

  const [wantsMorePhotos, setWantsMorePhotos] = useState(false);

  const photosQuery = useInfiniteQuery({
    queryKey: pinPhotosQueryKey(pinId ?? ""),
    queryFn: ({ pageParam, signal }) =>
      fetchPinPhotoPage(pinId as string, { cursor: pageParam }, { signal, apiBaseUrl }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: enabled && wantsMorePhotos,
    staleTime: DETAIL_STALE_TIME_MS,
    gcTime: DETAIL_GC_TIME_MS,
    retry: false,
  });

  const {
    photos,
    hasMore: hasMorePhotos,
    photoCount,
  } = useMemo(
    () =>
      resolvePinDetailPhotos({
        detailPhotos: detailQuery.data?.photos ?? [],
        photoCount: detailQuery.data?.photoCount ?? 0,
        pages: photosQuery.data?.pages,
      }),
    [detailQuery.data, photosQuery.data],
  );

  const { fetchNextPage } = photosQuery;
  const isLoadingMorePhotos = resolveIsLoadingMorePhotos({
    wantsMorePhotos,
    isPending: photosQuery.isPending,
    isFetchingNextPage: photosQuery.isFetchingNextPage,
  });
  const loadMorePhotos = useCallback(() => {
    if (isLoadingMorePhotos) return;
    if (!wantsMorePhotos) {
      setWantsMorePhotos(true);
      return;
    }
    void fetchNextPage();
  }, [isLoadingMorePhotos, wantsMorePhotos, fetchNextPage]);

  const photosErrorCode = photosQuery.error ? toPinReadErrorCode(photosQuery.error) : null;

  // 壊れたカーソルは同じ値を再送しても直らないため、`refetch` ではなく queryKey ごと捨てる
  // （`useWalkHistory.reload()` と同じ理由）。ネットワーク再送を伴う副作用なので
  // レンダー本体ではなく useEffect で行う。
  useEffect(() => {
    if (photosErrorCode !== "invalid_cursor" || pinId === null) return;
    void queryClient.resetQueries({ queryKey: pinPhotosQueryKey(pinId) });
  }, [photosErrorCode, pinId, queryClient]);

  const { refetch: refetchDetail } = detailQuery;
  const retry = useCallback(() => {
    void refetchDetail();
  }, [refetchDetail]);

  const dataUpdatedAt = detailQuery.dataUpdatedAt;
  const hasFetchedPhotoPages = (photosQuery.data?.pages.length ?? 0) > 0;
  const handlePhotoLoadError = useCallback(() => {
    if (pinId === null) return;
    if (!shouldRefreshPhotoUrls({ dataUpdatedAt, now: Date.now() })) return;
    void queryClient.invalidateQueries({ queryKey: pinDetailQueryKey(pinId) });
    if (hasFetchedPhotoPages) {
      void queryClient.invalidateQueries({ queryKey: pinPhotosQueryKey(pinId) });
    }
  }, [pinId, dataUpdatedAt, hasFetchedPhotoPages, queryClient]);

  return {
    pin: detailQuery.data ?? null,
    isLoading: detailQuery.isPending && enabled,
    isFetching: detailQuery.isFetching,
    errorCode: detailQuery.error ? toPinReadErrorCode(detailQuery.error) : null,
    retry,
    photos,
    photoCount,
    hasMorePhotos,
    isLoadingMorePhotos,
    photosErrorCode,
    loadMorePhotos,
    handlePhotoLoadError,
  };
}

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";

import { getApiBaseUrl } from "@/config/env";
import { fetchAllPinsInSanpoMap } from "@/features/pin/api/pinReadApi";
import { shouldRefreshPhotoUrls } from "@/features/pin/lib/pinDetailState";
import { sanpoMapPinsQueryKey } from "@/features/pin/lib/pinQueryKeys";
import { toPinReadErrorCode, type PinReadErrorCode } from "@/features/pin/lib/pinReadError";
import { resolveQueryLoadStatus } from "@/features/pin/lib/queryLoadStatus";
import type { PinListEntry } from "@/features/pin/types";

/** 表示範囲を動かさない画面なので、短い間隔での取り直しは抑える。 */
const STALE_TIME_MS = 60_000;
const GC_TIME_MS = 10 * 60_000;

export type UseSanpoMapPinsResult = {
  pins: PinListEntry[];
  /** 上限（1000 件）を超えて打ち切った。 */
  truncated: boolean;
  status: "loading" | "ready" | "error";
  errorCode: PinReadErrorCode | null;
  retry: () => void;
  /** pull-to-refresh 用。取得の完了（失敗を含む）で解決する。 */
  refresh: () => Promise<void>;
  /** 代表写真の読み込みに失敗したとき（URL の失効の可能性）。60 秒未満なら何もしない。 */
  handlePhotoLoadError: () => void;
};

const EMPTY_PINS: PinListEntry[] = [];

/**
 * 地図詳細のピン一覧（全件・上限 1000）のサーバー状態と、代表写真の URL の取り直し（SS-121）。
 * 端末で名前の絞り込みをするため `useInfiniteQuery` ではなく、全ページを1つの取得関数で
 * 順に取る `useQuery` 1本にしている（mobile ADR-014 D2）。
 *
 * `enabled` が false（ゲスト）のときは通信せず status は "ready"（呼び出し側の状態判定が
 * ゲストを先に扱う）。地図一覧（`useSanpoMaps`）の取得は待たず並列に走らせる。
 */
export function useSanpoMapPins(
  sanpoMapId: string | null,
  options: { enabled: boolean },
): UseSanpoMapPinsResult {
  const queryClient = useQueryClient();
  const enabled = options.enabled && sanpoMapId !== null;
  const apiBaseUrl = getApiBaseUrl();

  const query = useQuery({
    queryKey: sanpoMapPinsQueryKey(sanpoMapId ?? ""),
    queryFn: ({ signal }) =>
      fetchAllPinsInSanpoMap({ sanpoMapId: sanpoMapId as string }, { signal, apiBaseUrl }),
    enabled,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    // GET の一時障害の再送は customFetch の transientRetry が既に行う（useRegisteredPins と同じ）。
    retry: false,
  });

  const { refetch, dataUpdatedAt } = query;
  // 再取得のたびに handlePhotoLoadError の参照が変わって全行が再レンダーされないよう ref で持つ。
  const dataUpdatedAtRef = useRef(dataUpdatedAt);
  dataUpdatedAtRef.current = dataUpdatedAt;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const handlePhotoLoadError = useCallback(() => {
    if (sanpoMapId === null) return;
    if (!shouldRefreshPhotoUrls({ dataUpdatedAt: dataUpdatedAtRef.current, now: Date.now() }))
      return;
    void queryClient.invalidateQueries({ queryKey: sanpoMapPinsQueryKey(sanpoMapId) });
  }, [queryClient, sanpoMapId]);

  // 表示できるデータがあるときの再取得失敗では error にしない（ピン一覧を消さない）。
  const status: UseSanpoMapPinsResult["status"] = !enabled
    ? "ready"
    : resolveQueryLoadStatus({
        isPending: query.isPending,
        isError: query.isError,
        hasData: query.data !== undefined,
      });

  return {
    pins: query.data?.pins ?? EMPTY_PINS,
    truncated: query.data?.truncated ?? false,
    status,
    errorCode: status === "error" && query.error ? toPinReadErrorCode(query.error) : null,
    retry,
    refresh,
    handlePhotoLoadError,
  };
}

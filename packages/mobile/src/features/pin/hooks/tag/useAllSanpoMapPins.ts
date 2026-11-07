import { useQueries, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { getApiBaseUrl } from "@/config/env";
import { fetchAllPinsInSanpoMap } from "@/features/pin/api/pinReadApi";
import { useSanpoMaps } from "@/features/pin/hooks/useSanpoMaps";
import { shouldRefreshPhotoUrls } from "@/features/pin/lib/pinDetailState";
import { SANPO_MAP_PINS_QUERY_ROOT, sanpoMapPinsQueryKey } from "@/features/pin/lib/pinQueryKeys";
import {
  combineSanpoMapPins,
  type CombinedSanpoMapPins,
  type SanpoMapPinsQueryResult,
} from "@/features/pin/lib/tag/tagScreenState";

/** `useSanpoMapPins` と同じ値（同じ queryKey のキャッシュを共有するため、鮮度の扱いを揃える）。 */
const STALE_TIME_MS = 60_000;
const GC_TIME_MS = 10 * 60_000;

function pickSanpoMapPinsQueryResults(
  results: readonly SanpoMapPinsQueryResult[],
): SanpoMapPinsQueryResult[] {
  return results.map(({ data, error, isPending, isError }) => ({
    data,
    error,
    isPending,
    isError,
  }));
}

export type UseAllSanpoMapPinsResult = CombinedSanpoMapPins & {
  /** 地図一覧・地図ごとのピンのどれかを取得中（初回・取り直しを問わない）。 */
  isFetching: boolean;
  retry: () => void;
  /** pull-to-refresh 用。地図一覧と各地図のピンの取得の完了（失敗を含む）で解決する。 */
  refresh: () => Promise<void>;
  /** 代表写真の読み込みに失敗したとき（URL の失効の可能性）。その地図を取り直す（60 秒未満なら何もしない）。 */
  handlePhotoLoadError: (sanpoMapId: string) => void;
};

/**
 * 自分がメンバーの全地図のピン（地図ごとに全件・上限 1000 件）を取る（タグ一覧・タグ詳細。SS-245）。
 * 地図詳細（`useSanpoMapPins`）と同じ queryKey・取得関数を地図ごとに `useQueries` で並べるので、キャッシュを共有し、
 * ピンの保存・編集・削除の `["pins"]` の invalidate でそのまま新しくなる。
 * 地図ごとのピンの表示・非表示（SS-266）は地図の表示だけの設定なので見ない（地図詳細の一覧と同じく全地図）。
 * `enabled` が false（ゲスト）のときは通信しない（呼び出し側がゲストを先に扱う）。
 */
export type UseAllSanpoMapPinsOptions = {
  enabled: boolean;
  /**
   * 開いたときに鮮度に関わらず地図ごとのピンを取り直す（タグ詳細。SS-245）。ピン詳細は開くたびに取るので、
   * 別のメンバー（や別の端末）が直前に足したピンの詳細からタグを押すと、キャッシュ（staleTime 60 秒）の一覧に
   * そのピンが無く「このタグが付いたピンはありません」と食い違う。取り直しの間はキャッシュを出しておく。
   */
  refetchOnOpen?: boolean;
};

export function useAllSanpoMapPins(options: UseAllSanpoMapPinsOptions): UseAllSanpoMapPinsResult {
  const queryClient = useQueryClient();
  const apiBaseUrl = getApiBaseUrl();
  const maps = useSanpoMaps({ enabled: options.enabled });

  const results = useQueries({
    queries: maps.maps.map((map) => ({
      queryKey: sanpoMapPinsQueryKey(map.id),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        fetchAllPinsInSanpoMap({ sanpoMapId: map.id }, { signal, apiBaseUrl }),
      enabled: options.enabled,
      refetchOnMount: options.refetchOnOpen === true ? ("always" as const) : true,
      staleTime: STALE_TIME_MS,
      gcTime: GC_TIME_MS,
      // GET の一時障害の再送は customFetch の transientRetry が既に行う（useSanpoMapPins と同じ）。
      retry: false,
    })),
    // 必要な部分だけを取り出す（モジュールレベルの安定した参照。結果は構造共有されるので、
    // 中身が変わらなければ同じ参照になり、下の集計を作り直さない）。
    combine: pickSanpoMapPinsQueryResults,
  });

  const combined = useMemo(
    () =>
      combineSanpoMapPins({
        mapsStatus: maps.status,
        mapsErrorCode: maps.errorCode,
        maps: maps.maps,
        results,
      }),
    [maps.status, maps.errorCode, maps.maps, results],
  );

  const { retry: retryMaps, refresh: refreshMaps } = maps;
  // 画面に出ている（active な）地図ごとのピンの取得をまとめて取り直す。地図一覧が変われば新しい地図の取得は自動で始まる。
  const refetchActiveSanpoMapPins = () =>
    queryClient.refetchQueries({ queryKey: SANPO_MAP_PINS_QUERY_ROOT, type: "active" });

  // 手動のメモ化はしない（React Compiler が行う。mobile の hooks の約束）。
  const retry = () => {
    retryMaps();
    void refetchActiveSanpoMapPins();
  };

  const refresh = async () => {
    await Promise.all([refreshMaps(), refetchActiveSanpoMapPins()]);
  };

  const handlePhotoLoadError = useCallback(
    (sanpoMapId: string) => {
      const queryKey = sanpoMapPinsQueryKey(sanpoMapId);
      const dataUpdatedAt = queryClient.getQueryState(queryKey)?.dataUpdatedAt ?? 0;
      if (!shouldRefreshPhotoUrls({ dataUpdatedAt, now: Date.now() })) return;
      // 取得中は中断して取り直さない（期限切れの URL のサムネイルが一斉に失敗しても1回で済ませる。useSanpoMapPins と同じ）。
      if (queryClient.isFetching({ queryKey }) > 0) return;
      void queryClient.invalidateQueries({ queryKey }, { cancelRefetch: false });
    },
    [queryClient],
  );

  const isFetching = maps.isFetching || results.some((result) => result.isFetching === true);

  return { ...combined, isFetching, retry, refresh, handlePhotoLoadError };
}

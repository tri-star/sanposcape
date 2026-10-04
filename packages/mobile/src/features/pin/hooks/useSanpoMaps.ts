import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { fetchSanpoMaps } from "@/features/pin/api/sanpoMapApi";
import { SANPO_MAPS_QUERY_KEY } from "@/features/pin/lib/pinQueryKeys";
import { toPinReadErrorCode, type PinReadErrorCode } from "@/features/pin/lib/pinReadError";
import { resolveQueryLoadStatus } from "@/features/pin/lib/queryLoadStatus";
import type { SanpoMap } from "@/features/pin/types";

/** データ未取得の間も `maps` の参照を安定させる（`useRegisteredPins` の useMemo の依存になる）。 */
const EMPTY_SANPO_MAPS: SanpoMap[] = [];

/** サーバーから取得しなおす頻度を抑える（登録画面を開いている間はほぼ変わらない）。 */
const STALE_TIME_MS = 5 * 60_000;

export type UseSanpoMapsResult = {
  status: "loading" | "ready" | "error";
  maps: SanpoMap[];
  retry: () => void;
  /** 失敗の分類（status が "error" のときだけ非 null。データがある再取得失敗では null）。 */
  errorCode: PinReadErrorCode | null;
  /** pull-to-refresh 用。取得の完了（失敗を含む）で解決する。 */
  refresh: () => Promise<void>;
  /** 取得中（初回・再取得を問わない）。バックグラウンドの取り直しも含む。 */
  isFetching: boolean;
};

/**
 * `GET /sanpo-maps` の TanStack Query ラッパ。
 * `enabled` はルートから来る `isSignedIn`（ゲストで 401 を踏みに行かない）。
 */
export function useSanpoMaps(options: { enabled: boolean }): UseSanpoMapsResult {
  const query = useQuery({
    queryKey: SANPO_MAPS_QUERY_KEY,
    queryFn: ({ signal }) => fetchSanpoMaps({ signal }),
    enabled: options.enabled,
    staleTime: STALE_TIME_MS,
  });

  const { refetch } = query;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  // 表示できるデータがあるときの再取得失敗では error にしない（一覧を消さない）。
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const status = resolveQueryLoadStatus({
    isPending: query.isPending,
    isError: query.isError,
    hasData: query.data !== undefined,
  });

  // キャッシュの更新は書き込み側が行う（保存成功時の invalidate は `usePinSave`、地図の作成時の
  // 挿入・invalidate は `useSanpoMapCreate`）。この hook は同じ queryKey のキャッシュを読むだけ。
  return {
    status,
    maps: query.data ?? EMPTY_SANPO_MAPS,
    retry,
    errorCode: status === "error" && query.error ? toPinReadErrorCode(query.error) : null,
    refresh,
    isFetching: query.isFetching,
  };
}

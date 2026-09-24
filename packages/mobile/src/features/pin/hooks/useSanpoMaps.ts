import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { fetchSanpoMaps } from "@/features/pin/api/sanpoMapApi";
import type { SanpoMap } from "@/features/pin/types";

/** 一覧全体（`useSanpoMaps` / 保存成功時の invalidate）で共有するクエリキー。 */
export const SANPO_MAPS_QUERY_KEY = ["sanpo-maps", "list"] as const;

/** サーバーから取得しなおす頻度を抑える（登録画面を開いている間はほぼ変わらない）。 */
const STALE_TIME_MS = 5 * 60_000;

export type UseSanpoMapsResult = {
  status: "loading" | "ready" | "error";
  maps: SanpoMap[];
  retry: () => void;
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

  const status: UseSanpoMapsResult["status"] = query.isPending
    ? "loading"
    : query.isError
      ? "error"
      : "ready";

  // 保存成功時の invalidate は呼び出し側（usePinSave）が行う。この hook はキャッシュを
  // 読むだけ（同じ queryKey なので新しく作られた「最初の地図」を反映できる）。
  return { status, maps: query.data ?? [], retry };
}

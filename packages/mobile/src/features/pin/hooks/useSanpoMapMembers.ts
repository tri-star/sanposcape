import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { fetchSanpoMapMembers } from "@/features/pin/api/sanpoMapApi";
import { sanpoMapMembersQueryKey } from "@/features/pin/lib/pinQueryKeys";
import { resolveQueryLoadStatus, type QueryLoadStatus } from "@/features/pin/lib/queryLoadStatus";
import type { SanpoMapMember } from "@/features/pin/types";

const STALE_TIME_MS = 60_000;

export type UseSanpoMapMembersResult = {
  members: SanpoMapMember[];
  status: QueryLoadStatus;
  retry: () => void;
  /** pull-to-refresh 用。取得の完了（失敗を含む）で解決する。 */
  refresh: () => Promise<void>;
};

const EMPTY_MEMBERS: SanpoMapMember[] = [];

/**
 * 地図のメンバー（`GET /sanpo-maps/{id}/members`。SS-249）のサーバー状態。地図詳細のメンバーの行と
 * メンバー画面で同じキャッシュを使う。`enabled` が false のときは通信せず status は "ready"。
 */
export function useSanpoMapMembers(
  sanpoMapId: string | null,
  options: { enabled: boolean },
): UseSanpoMapMembersResult {
  const enabled = options.enabled && sanpoMapId !== null;
  const query = useQuery({
    queryKey: sanpoMapMembersQueryKey(sanpoMapId ?? ""),
    queryFn: ({ signal }) => fetchSanpoMapMembers(sanpoMapId as string, { signal }),
    enabled,
    staleTime: STALE_TIME_MS,
    // GET の一時障害の再送は customFetch の transientRetry が既に行う。
    retry: false,
  });
  const { refetch } = query;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  const refresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return {
    members: query.data ?? EMPTY_MEMBERS,
    status: enabled
      ? resolveQueryLoadStatus({
          isPending: query.isPending,
          isError: query.isError,
          hasData: query.data !== undefined,
        })
      : "ready",
    retry,
    refresh,
  };
}

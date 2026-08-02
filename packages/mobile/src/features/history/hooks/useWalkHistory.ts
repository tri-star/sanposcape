import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { fetchWalkList } from "@/features/history/api/walkHistoryApi";
import {
  toWalkHistoryErrorCode,
  type WalkHistoryErrorCode,
} from "@/features/history/lib/walkHistoryError";
import { dedupeWalkHistoryItems, toWalkHistoryItems } from "@/features/history/lib/walkHistoryItem";
import { buildWalkListParams } from "@/features/history/lib/walkHistoryParams";
import type { WalkHistoryItem } from "@/features/history/types";

/** サーバー状態の鮮度（30秒。`queryClient` の既定と同値。意図を明示するために書く）。 */
const STALE_TIME_MS = 30_000;
const GC_TIME_MS = 5 * 60_000;

export type UseWalkHistoryResult = {
  items: WalkHistoryItem[];
  /** 初回取得中（1件も表示できていない）。 */
  isLoading: boolean;
  /** pull-to-refresh 等での再取得中。 */
  isRefetching: boolean;
  isFetchingNextPage: boolean;
  hasNextPage: boolean;
  errorCode: WalkHistoryErrorCode | null;
  fetchNextPage: () => void;
  /** 先頭ページから読み直す（invalid_cursor からの復旧・pull-to-refresh 用）。 */
  reload: () => void;
};

/**
 * 履歴一覧のサーバー状態（カーソルページネーション）を提供する hook。
 * `queryKey` は `["walks", ...]` 始まりにする（ADR-008 の申し送り。`useWalkSave` の
 * `invalidateQueries({ queryKey: ["walks"] })` に載せて、保存直後に一覧を更新するため）。
 */
export function useWalkHistory(options?: { limit?: number }): UseWalkHistoryResult {
  const limit = options?.limit;
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ["walks", "list", { limit }] as const, [limit]);

  const query = useInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam, signal }) =>
      fetchWalkList(buildWalkListParams({ limit, cursor: pageParam }), { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    retry: false,
  });

  const items = useMemo(() => {
    const pages = query.data?.pages ?? [];
    const flattened = pages.flatMap((page) => toWalkHistoryItems(page.items));
    return dedupeWalkHistoryItems(flattened);
  }, [query.data]);

  const { fetchNextPage: queryFetchNextPage } = query;
  const fetchNextPage = useCallback(() => {
    void queryFetchNextPage();
  }, [queryFetchNextPage]);

  const reload = useCallback(() => {
    void queryClient.resetQueries({ queryKey });
  }, [queryClient, queryKey]);

  return {
    items,
    isLoading: query.isPending,
    isRefetching: query.isFetching && !query.isPending && !query.isFetchingNextPage,
    isFetchingNextPage: query.isFetchingNextPage,
    hasNextPage: query.hasNextPage,
    errorCode: query.error ? toWalkHistoryErrorCode(query.error) : null,
    fetchNextPage,
    reload,
  };
}

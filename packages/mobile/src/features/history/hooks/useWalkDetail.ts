import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

import { fetchWalkDetail } from "@/features/history/api/walkHistoryApi";
import { toWalkDetail } from "@/features/history/lib/walkDetail";
import {
  toWalkHistoryErrorCode,
  type WalkHistoryErrorCode,
} from "@/features/history/lib/walkHistoryError";
import type { WalkDetail } from "@/features/history/types";

/** 保存済みの散歩記録は不変なので長めに持つ（ADR-008 決定2 と同じ考え方）。 */
const STALE_TIME_MS = 60 * 60_000;
const GC_TIME_MS = 2 * 60 * 60_000;

export type UseWalkDetailResult = {
  walk: WalkDetail | null;
  isLoading: boolean;
  errorCode: WalkHistoryErrorCode | null;
  retry: () => void;
};

/**
 * 散歩履歴1件の詳細（軌跡付き）を提供する hook。
 *
 * `queryKey`（`["walks","detail",walkId]`）は `useWalkDelete.ts` の
 * `removeQueries({ queryKey: ["walks","detail",walkId], exact: true })` と必ず一致させること
 * （片方だけ変えると削除成功後にこのキャッシュが消えず、消したはずの内容が一瞬出る）。
 */
export function useWalkDetail(walkId: string | null): UseWalkDetailResult {
  const enabled = walkId !== null && walkId.length > 0;

  const query = useQuery({
    queryKey: ["walks", "detail", walkId],
    // `enabled` が false のとき（walkId が null または空文字）は TanStack Query が queryFn を
    // 呼ばないため、この時点で walkId は非 null・非空であることが保証されている。
    queryFn: ({ signal }) => fetchWalkDetail(walkId as string, { signal }),
    enabled,
    staleTime: STALE_TIME_MS,
    gcTime: GC_TIME_MS,
    retry: false,
  });

  const walk = useMemo(() => (query.data ? toWalkDetail(query.data) : null), [query.data]);

  const { refetch } = query;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);

  return {
    walk,
    isLoading: query.isPending && enabled,
    errorCode: query.error ? toWalkHistoryErrorCode(query.error) : null,
    retry,
  };
}

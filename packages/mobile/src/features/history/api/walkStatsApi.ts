import { ApiError } from "@/api/apiError";
import { getWalkStatsWalksStatsGet } from "@/api/generated/endpoints/walks/walks";
import type { WalkStatsRead } from "@/api/generated/model";

/**
 * 記録タブの集計（週/月チャート・連続日数・今日の距離）を取得する。
 * `walkHistoryApi.ts` と同じ理由で生成 hook ではなく素の fetcher を使う
 * （`react-native` を値 import しないので node の vitest でテストできる）。
 * `@/services/auth` は import しない（認証は customFetch が authTokenProvider 経由で付ける）。
 *
 * クエリパラメータは持たないため、`fetchWalkDetail` のような入力検証は不要。
 * `signal` は受け取って渡す（read 系なので画面離脱時に中断してよい。`saveWalk` と違う点）。
 */
export async function fetchWalkStats(options?: { signal?: AbortSignal }): Promise<WalkStatsRead> {
  const response = await getWalkStatsWalksStatsGet({ signal: options?.signal });
  if (response.status !== 200) {
    throw new ApiError(response.status);
  }
  return response.data;
}

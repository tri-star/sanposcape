import { ApiError } from "@/api/apiError";
import { getWalkWalksWalkIdGet, listWalksWalksGet } from "@/api/generated/endpoints/walks/walks";
import type { ListWalksWalksGetParams, WalkDetailRead, WalkListRead } from "@/api/generated/model";

/**
 * 散歩履歴の一覧を取得する。
 *
 * `walkApi.ts` / `exploreApi.ts` と同じ理由で生成 hook（`useListWalksWalksGet`）ではなく
 * 素の fetcher を使う: `react-native` を値 import しないので node の vitest でテストできる。
 * `services/auth` は import しない（認証は customFetch が authTokenProvider 経由で付ける）。
 *
 * `signal` は渡す: `saveWalk` と違い、画面離脱時に取得を中断してよい read 系のため。
 */
export async function fetchWalkList(
  params: ListWalksWalksGetParams,
  options?: { signal?: AbortSignal },
): Promise<WalkListRead> {
  const response = await listWalksWalksGet(params, { signal: options?.signal });
  if (response.status !== 200) {
    throw new ApiError(response.status);
  }
  return response.data;
}

/** 散歩1件の詳細（軌跡付き）を取得する。 */
export async function fetchWalkDetail(
  walkId: string,
  options?: { signal?: AbortSignal },
): Promise<WalkDetailRead> {
  const response = await getWalkWalksWalkIdGet(walkId, { signal: options?.signal });
  if (response.status !== 200) {
    throw new ApiError(response.status);
  }
  return response.data;
}

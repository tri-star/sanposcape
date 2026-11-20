import { ApiError } from "@/api/apiError";
import { createWalkWalksPost } from "@/api/generated/endpoints/walks/walks";
import type { WalkCreate, WalkRead } from "@/api/generated/model";

/**
 * 散歩記録を保存する。201（新規）と 200（client_walk_id の冪等再送）の両方を成功として扱う。
 *
 * `signal` は渡さない: 保存中にサマリ画面を離れても送信を中断させないため
 * （query の fetcher とは意図的に扱いを変えている）。
 *
 * `exploreApi.ts` / `walkRouteApi.ts` と同じ理由で hook（`useCreateWalkWalksPost`）ではなく
 * 素の fetcher を使う: `react-native` を値 import しないので node の vitest でテストできる。
 * `services/auth` は import しない（認証は customFetch が authTokenProvider 経由で付ける）。
 */
export async function saveWalk(request: WalkCreate): Promise<WalkRead> {
  const response = await createWalkWalksPost(request);
  if (response.status === 201 || response.status === 200) {
    return response.data;
  }
  // customFetch は非2xx で ApiError を throw するため通常ここには来ない（型の網羅のため）。
  throw new ApiError(response.status);
}

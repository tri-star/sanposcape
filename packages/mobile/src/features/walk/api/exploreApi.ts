import { ApiError } from "@/api/apiError";
import { searchExplorePlaces } from "@/api/generated/endpoints/explore/explore";
import type { PlaceSearchRequest } from "@/api/generated/model";
import { toSpotCandidates } from "@/features/walk/lib/spotCandidate";
import type { SpotCandidate } from "@/features/walk/types";

/**
 * /explore/places を叩いてスポット候補を取得する。
 * 認証は customFetch が authTokenProvider 経由で付けるため、この層は services/auth を知らない
 * （探索ロジックを認証に不可分に依存させないための境界。milestones M4 完了条件）。
 *
 * hook（`useSearchExplorePlaces`）ではなく素の fetcher を使う理由: queryKey / `enabled` /
 * `retry` / `placeholderData` を自前で制御したいのと、この関数が `react-native` を値 import
 * しないので node の vitest でテストできるため。
 */
export async function fetchSpotCandidates(
  request: PlaceSearchRequest,
  options?: { signal?: AbortSignal },
): Promise<SpotCandidate[]> {
  const response = await searchExplorePlaces(request, { signal: options?.signal });
  if (response.status !== 200) {
    // customFetch は非2xx で ApiError を throw するため通常ここには来ない（型の網羅のため）。
    throw new ApiError(response.status);
  }
  return toSpotCandidates(response.data.candidates);
}

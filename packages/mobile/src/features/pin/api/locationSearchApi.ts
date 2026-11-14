import { ApiError } from "@/api/apiError";
import { searchExplorePlacesByText } from "@/api/generated/endpoints/explore/explore";
import type { PlaceTextSearchRequest } from "@/api/generated/model";
import {
  toLocationSearchResults,
  type LocationSearchResult,
  type LocationSearchScope,
} from "@/features/pin/lib/location-search/locationSearch";

export type LocationSearchResponse = {
  results: LocationSearchResult[];
  scope: LocationSearchScope;
};

/**
 * `POST /explore/places/text-search` でピンタブの検索をする（SS-267）。検索語は本文で送る（URL に載せない）。
 * 見つからなければ `results: []`。
 */
export async function fetchLocationSearch(
  request: PlaceTextSearchRequest,
  options: { signal?: AbortSignal } = {},
): Promise<LocationSearchResponse> {
  const response = await searchExplorePlacesByText(request, { signal: options.signal });
  if (response.status !== 200) {
    // customFetch は非2xx で ApiError を throw するため通常ここには来ない（型の網羅のため）。
    throw new ApiError(response.status);
  }
  return { results: toLocationSearchResults(response.data), scope: response.data.scope };
}

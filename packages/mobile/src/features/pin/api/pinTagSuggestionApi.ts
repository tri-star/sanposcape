import { ApiError } from "@/api/apiError";
import { listSanpoMapTags } from "@/api/generated/endpoints/sanpo-maps/sanpo-maps";
import type { ListSanpoMapTagsParams } from "@/api/generated/model";
import {
  PIN_TAG_SUGGESTIONS_FETCH_LIMIT,
  toTagSuggestions,
} from "@/features/pin/lib/pinTagSuggestions";
import type { TagSuggestion } from "@/features/pin/types";
import { isUuid } from "@/lib/uuid";

/**
 * `GET /sanpo-maps/{sanpo_map_id}/tags`（SS-136）。地図で使われているタグを、よく使う順に
 * 上位 N 件まとめて取る（絞り込みは端末で行う。mobile ADR-013）。
 * `sanpoMapId` が UUID 形式でなければ通信せず `ApiError(404)`（`fetchPinDetail` と同じ多層防御。
 * Orval の URL ビルダーはエスケープしないため）。
 */
export async function fetchPinTagSuggestions(
  sanpoMapId: string,
  options: { signal?: AbortSignal },
): Promise<TagSuggestion[]> {
  if (!isUuid(sanpoMapId)) {
    throw new ApiError(404, "sanpoMapId is not a UUID");
  }
  // キーは必ず値付きで渡す（null を渡すと Orval が "null" という文字列で送る）。
  const params: ListSanpoMapTagsParams = { limit: PIN_TAG_SUGGESTIONS_FETCH_LIMIT };
  const response = await listSanpoMapTags(sanpoMapId, params, { signal: options.signal });
  if (response.status !== 200) {
    throw new ApiError(response.status);
  }
  return toTagSuggestions(response.data.items);
}

import { ApiError } from "@/api/apiError";
import { getPin, listPinPhotos, listPins } from "@/api/generated/endpoints/pins/pins";
import type { ListPinPhotosParams } from "@/api/generated/model";
import { buildListPinsParams } from "@/features/pin/lib/pinFetchBounds";
import {
  toPinDetail,
  toPinListEntry,
  toPinPhotoPage,
  toPinSummary,
} from "@/features/pin/lib/pinRead";
import {
  SANPO_MAP_PIN_MAX_PAGES,
  buildSanpoMapPinListParams,
} from "@/features/pin/lib/sanpoMapPinList";
import type {
  GeoBounds,
  PinDetail,
  PinListEntry,
  PinPhotoPage,
  PinSummary,
} from "@/features/pin/types";
import { isUuid } from "@/lib/uuid";

/** 1ページの写真取得件数（backend の既定と同じ）。 */
export const PIN_PHOTO_PAGE_SIZE = 30;

/**
 * `GET /pins`（1ページ目のみ。ページングは続けない。ルート ADR-009 の持ち越しの決着。
 * mobile ADR-012 D3）。`items` は `toPinSummary` して不正座標を除外する。
 * `hasMore` は `next_cursor !== null`（打ち切りの目印。実際のページングはしない）。
 *
 * 素の fetcher（`listPins`）を使う理由: `useRegisteredPins` 側で queryKey / `enabled` /
 * `staleTime` を制御したいのと、`react-native` を値 import しないので node の vitest で
 * テストできるため（`docs/folder-structure.md`）。`signal` は渡す（read 系のため画面離脱で
 * 中断してよい）。
 */
export async function fetchPinsInBounds(
  input: { sanpoMapId: string; bounds: GeoBounds; limit?: number },
  options: { signal?: AbortSignal },
): Promise<{ pins: PinSummary[]; hasMore: boolean }> {
  const params = buildListPinsParams(input);
  const response = await listPins(params, { signal: options.signal });
  if (response.status !== 200) {
    throw new ApiError(response.status);
  }
  const pins: PinSummary[] = [];
  for (const item of response.data.items) {
    const summary = toPinSummary(item);
    if (summary !== null) pins.push(summary);
  }
  return { pins, hasMore: response.data.next_cursor !== null };
}

/**
 * `GET /pins/{pin_id}`。`pinId` が UUID 形式でなければ通信せず `ApiError(404)`
 * （`fetchWalkDetail` と同じ多層防御。Orval の URL ビルダーはエスケープしないため）。
 */
export async function fetchPinDetail(
  pinId: string,
  options: { signal?: AbortSignal; apiBaseUrl: string },
): Promise<PinDetail> {
  if (!isUuid(pinId)) {
    throw new ApiError(404, "pinId is not a UUID");
  }
  const response = await getPin(pinId, { signal: options.signal });
  if (response.status !== 200) {
    throw new ApiError(response.status);
  }
  return toPinDetail(response.data, { apiBaseUrl: options.apiBaseUrl });
}

/**
 * `GET /pins/{pin_id}/photos`。`cursor` は「空でない文字列」のときだけキーを立てる
 * （`?cursor=null` を送らない。`@/features/history/lib/walkHistoryParams.ts` と同じ落とし穴）。
 */
export async function fetchPinPhotoPage(
  pinId: string,
  input: { cursor: string | null },
  options: { signal?: AbortSignal; apiBaseUrl: string },
): Promise<PinPhotoPage> {
  if (!isUuid(pinId)) {
    throw new ApiError(404, "pinId is not a UUID");
  }
  const params: ListPinPhotosParams = { limit: PIN_PHOTO_PAGE_SIZE };
  if (typeof input.cursor === "string" && input.cursor.length > 0) {
    params.cursor = input.cursor;
  }
  const response = await listPinPhotos(pinId, params, { signal: options.signal });
  if (response.status !== 200) {
    throw new ApiError(response.status);
  }
  return toPinPhotoPage(response.data, { apiBaseUrl: options.apiBaseUrl });
}

/**
 * `GET /pins` を地図単位で next_cursor が null になるまで順に取る（最大 maxPages ページ。SS-121）。
 * 端末で名前の絞り込みをするため、無限スクロールではなく全件（上限つき）を1回の取得で揃える
 * （mobile ADR-014）。
 * `sanpoMapId` が UUID でなければ通信せず `ApiError(404)`（`fetchPinDetail` と同じ多層防御）。
 * id の重複は先勝ちで除く。`signal` は各リクエストに渡す（read なので画面離脱で中断してよい）。
 * 取り直しは常に1ページ目から（カーソルを保存しない）。
 */
export async function fetchAllPinsInSanpoMap(
  input: { sanpoMapId: string; maxPages?: number },
  options: { signal?: AbortSignal; apiBaseUrl: string },
): Promise<{ pins: PinListEntry[]; truncated: boolean }> {
  if (!isUuid(input.sanpoMapId)) {
    throw new ApiError(404, "sanpoMapId is not a UUID");
  }
  const requested = input.maxPages;
  const maxPages =
    typeof requested === "number" && Number.isFinite(requested) && requested >= 1
      ? Math.floor(requested)
      : SANPO_MAP_PIN_MAX_PAGES;

  const seen = new Set<string>();
  const pins: PinListEntry[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < maxPages; page += 1) {
    const params = buildSanpoMapPinListParams({ sanpoMapId: input.sanpoMapId, cursor });
    const response = await listPins(params, { signal: options.signal });
    if (response.status !== 200) {
      throw new ApiError(response.status);
    }
    for (const item of response.data.items) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      pins.push(toPinListEntry(item, { apiBaseUrl: options.apiBaseUrl }));
    }
    cursor = response.data.next_cursor;
    if (cursor === null) {
      return { pins, truncated: false };
    }
  }
  return { pins, truncated: cursor !== null };
}

import type {
  PinListItemRead,
  PinPhotoPageRead,
  PinPhotoRead,
  PinRead,
} from "@/api/generated/model";
import { isAllowedUploadUrl } from "@/features/pin/lib/presignedPostForm";
import type { PinDetail, PinPhoto, PinPhotoPage, PinSummary } from "@/features/pin/types";
import { isValidCoordinate } from "@/lib/geoCoordinate";

/**
 * `PinPhotoRead` を表示用の `PinPhoto` に変換する。`thumbnailUrl` / `originalUrl` は
 * `isAllowedUploadUrl`（直送と同じ許可規則: https は常に可、http は backend と同一 origin
 * だけ = `STORAGE_MODE=fake`）を通す。理由: 想定外の平文 URL を読み込まない多層防御
 * （SS-118。presignedPostForm.ts の JSDoc も参照）。
 */
export function toPinPhoto(read: PinPhotoRead, options: { apiBaseUrl: string }): PinPhoto {
  const thumbnailUrl =
    read.thumbnail !== null && isAllowedUploadUrl(read.thumbnail.url, options)
      ? read.thumbnail.url
      : null;
  const originalUrl =
    read.original_url !== null && isAllowedUploadUrl(read.original_url, options)
      ? read.original_url
      : null;

  return {
    id: read.id,
    position: read.position,
    thumbnailUrl,
    originalUrl,
    width: read.width,
    height: read.height,
  };
}

/** `location` が `isValidCoordinate` を満たさなければ null（Marker に渡す直前の防波堤）。 */
export function toPinSummary(read: PinListItemRead): PinSummary | null {
  if (!isValidCoordinate(read.location)) {
    return null;
  }
  return {
    id: read.id,
    sanpoMapId: read.sanpo_map_id,
    name: read.name,
    location: { latitude: read.location.latitude, longitude: read.location.longitude },
  };
}

export function toPinDetail(read: PinRead, options: { apiBaseUrl: string }): PinDetail {
  return {
    id: read.id,
    name: read.name,
    memo: read.memo,
    location: { latitude: read.location.latitude, longitude: read.location.longitude },
    tags: read.tags.map((tag) => ({ id: tag.id, label: tag.label })),
    photos: read.photos.map((photo) => toPinPhoto(photo, options)),
    photoCount: read.photo_count,
    sanpoMapName: read.sanpo_map.name,
    createdAt: read.created_at,
  };
}

export function toPinPhotoPage(
  read: PinPhotoPageRead,
  options: { apiBaseUrl: string },
): PinPhotoPage {
  return {
    items: read.items.map((photo) => toPinPhoto(photo, options)),
    photoCount: read.photo_count,
    nextCursor: read.next_cursor,
  };
}

/**
 * 複数地図から取得したピン一覧をマージする。`undefined`（まだ取得できていない地図）は無視する。
 * `id` で重複排除（最初に出たものを残す）。`truncated` はいずれかの `hasMore` が true なら true。
 */
export function mergeRegisteredPinPages(
  pages: ReadonlyArray<{ pins: PinSummary[]; hasMore: boolean } | undefined>,
): { pins: PinSummary[]; truncated: boolean } {
  const seen = new Set<string>();
  const pins: PinSummary[] = [];
  let truncated = false;

  for (const page of pages) {
    if (page === undefined) continue;
    if (page.hasMore) truncated = true;
    for (const pin of page.pins) {
      if (seen.has(pin.id)) continue;
      seen.add(pin.id);
      pins.push(pin);
    }
  }

  return { pins, truncated };
}

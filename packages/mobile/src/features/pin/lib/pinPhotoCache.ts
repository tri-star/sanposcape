export type PinPhotoVariant = "thumb" | "original";

/**
 * expo-image の `source.cacheKey` / `recyclingKey` に使うキー。presigned URL は応答ごとに
 * 変わるため URL をキーにしない（mobile ADR-010 決定8 / ルート ADR-009 決定15）。
 * サムネイルと原本は別の画像なので `variant` で分ける。
 *
 * 引数は `photoId` と `variant` のみを取り、URL は一切受け取らない（シグネチャで
 * 「URL が変わってもキーが同じ」を担保する）。
 */
export function pinPhotoCacheKey(photoId: string, variant: PinPhotoVariant): string {
  return `pin-photo:${photoId}:${variant}`;
}

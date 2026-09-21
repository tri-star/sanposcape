/** アップロード前に揃える長辺（px）。12MP 写真で概ね 0.3〜1.5MB になる（ユーザー決定: 端末縮小は維持）。 */
export const PHOTO_MAX_EDGE_PX = 2048;
/** JPEG 再圧縮の品質（0..1）。 */
export const PHOTO_JPEG_QUALITY = 0.7;

/**
 * 長辺が `maxEdge` 以下、または不正値（0以下・非有限）のときは `null`（縮小しない＝再圧縮のみ）。
 * 横長（width >= height）なら `{ width: maxEdge }`、縦長なら `{ height: maxEdge }` を返す
 * （`expo-image-manipulator` の `resize` 引数はどちらか片方だけ指定すればアスペクト比を保つ）。
 */
export function computeResizeTarget(
  width: number,
  height: number,
  maxEdge: number = PHOTO_MAX_EDGE_PX,
): { width: number } | { height: number } | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  const longEdge = Math.max(width, height);
  if (longEdge <= maxEdge) {
    return null;
  }

  return width >= height ? { width: maxEdge } : { height: maxEdge };
}

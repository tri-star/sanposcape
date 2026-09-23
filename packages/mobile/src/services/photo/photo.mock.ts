import { PhotoError } from "@/services/photo/photoError";
import { computeResizeTarget } from "@/services/photo/photoResize";
import type {
  PhotoErrorCode,
  PhotoService,
  PickedPhoto,
  PreparedPhoto,
} from "@/services/photo/types";

export const MOCK_PICKED_PHOTO: PickedPhoto = {
  uri: "mock://photo/1.jpg",
  width: 4032,
  height: 3024,
  mimeType: "image/jpeg",
};

export const MOCK_PREPARED_BYTE_SIZE = 480_000;

/**
 * `computeResizeTarget` の結果（片方の辺だけ）からアスペクト比を保った最終寸法を計算する。
 * `null`（縮小不要）ならそのまま返す。四捨五入して整数の px にする。
 */
function resizeKeepingAspectRatio(
  width: number,
  height: number,
  target: { width: number } | { height: number } | null,
): [number, number] {
  if (target === null) {
    return [width, height];
  }
  if ("width" in target) {
    return [target.width, Math.round((height / width) * target.width)];
  }
  return [Math.round((width / height) * target.height), target.height];
}

export type MockPhotoServiceOptions = {
  /** library で返す枚数（selectionLimit > 0 ならさらに頭打ち）。既定 1。 */
  count?: number;
  cancel?: boolean;
  pickFailWith?: PhotoErrorCode;
  prepareFailWith?: PhotoErrorCode;
  /** prepareForUpload が返すバイト数（上限超過の UI 確認用）。 */
  preparedByteSize?: number;
};

/**
 * mock: 通信もネイティブ API も一切使わず、メモリ上の固定値で完結する（vitest / E2E 用）。
 * `expo-image-picker` 等も `react-native` も import しないため `.test.ts` から直接テストできる。
 *
 * uri は実ファイルではないため、この mock が返す写真はアップロードすると失敗する
 * （E2E では写真を添付しない。ADR-010）。
 */
export function createMockPhotoService(options?: MockPhotoServiceOptions): PhotoService {
  const count = options?.count ?? 1;
  const cancel = options?.cancel ?? false;
  const pickFailWith = options?.pickFailWith;
  const prepareFailWith = options?.prepareFailWith;
  const preparedByteSize = options?.preparedByteSize ?? MOCK_PREPARED_BYTE_SIZE;

  return {
    async pickPhotos({ source, selectionLimit }) {
      if (pickFailWith) {
        throw new PhotoError(pickFailWith);
      }
      if (cancel) {
        return [];
      }

      const n =
        source === "camera" ? 1 : selectionLimit > 0 ? Math.min(count, selectionLimit) : count;
      return Array.from({ length: n }, (_, i) => ({
        uri: `mock://photo/${i + 1}.jpg`,
        width: MOCK_PICKED_PHOTO.width,
        height: MOCK_PICKED_PHOTO.height,
        mimeType: MOCK_PICKED_PHOTO.mimeType,
      }));
    },

    async prepareForUpload(photo): Promise<PreparedPhoto> {
      if (prepareFailWith) {
        throw new PhotoError(prepareFailWith);
      }

      const target = computeResizeTarget(photo.width, photo.height);
      const [width, height] = resizeKeepingAspectRatio(photo.width, photo.height, target);

      return {
        uri: photo.uri,
        width,
        height,
        byteSize: preparedByteSize,
        mimeType: "image/jpeg",
        // 実ファイルではないダミー（中身の長さは `byteSize` と一致しない）。この mock の写真を
        // 実際にアップロードすると S3 の content-length-range に掛かって失敗する——という
        // 既存の性質（上の JSDoc）はそのまま。E2E では写真を添付しない（ADR-010）。
        file: new Blob([new Uint8Array(8)], { type: "image/jpeg" }),
      };
    },
  };
}

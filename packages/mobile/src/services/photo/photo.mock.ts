import { MOCK_JPEG_BASE64 } from "@/services/photo/mockJpeg";
import { PhotoError } from "@/services/photo/photoError";
import { computeResizeTarget } from "@/services/photo/photoResize";
import type {
  PhotoErrorCode,
  PhotoService,
  PickedPhoto,
  PreparedPhoto,
} from "@/services/photo/types";

export const MOCK_TAKEN_AT = "2026-07-02T09:14:05+09:00";

export const MOCK_PICKED_PHOTO: PickedPhoto = {
  uri: "mock://photo/1.jpg",
  width: 4032,
  height: 3024,
  mimeType: "image/jpeg",
  takenAt: MOCK_TAKEN_AT,
};

/**
 * 加工後の写真の表示用 URI。登録画面のタイルに実際の画像が出る（expo-image は data URI を描ける）。
 */
export const MOCK_PREPARED_URI = `data:image/jpeg;base64,${MOCK_JPEG_BASE64}`;

let mockJpegBytesCache: Uint8Array | null = null;

/**
 * 埋め込みの JPEG の実バイト列（新しい配列）。backend の確定処理（デコード・サムネイル生成）を通る（SS-123）。
 * 復号は初めて呼ばれたときに行う: `@/services/photo` は real のビルドでもこのファイルを読み込むので、
 * 読み込み時に復号すると mock を使わない本番でも起動時に走る。`atob` は Hermes と Node のどちらにもある。
 */
export function mockJpegBytes(): Uint8Array {
  if (mockJpegBytesCache === null) {
    const binary = atob(MOCK_JPEG_BASE64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    mockJpegBytesCache = bytes;
  }
  // 呼び出し側（送信）が書き換えても埋め込みの値が壊れないよう、毎回複製して返す。
  return mockJpegBytesCache.slice();
}

/** base64 の長さから復号後のバイト数を求める（復号せずに済ませる。末尾の `=` は1つで1バイト減る）。 */
function base64ByteLength(base64: string): number {
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return (base64.length / 4) * 3 - padding;
}

/** prepareForUpload が返す既定のバイト数。枠の申請（`byte_size`）と送る実体の長さを一致させる。 */
export const MOCK_PREPARED_BYTE_SIZE = base64ByteLength(MOCK_JPEG_BASE64);

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
  /**
   * prepareForUpload が返すバイト数（上限超過の UI 確認用）。既定は埋め込みの JPEG の実バイト数。
   * 実体より大きな値にしても送るのは同じ JPEG なので、アップロードの確認には既定のまま使う。
   */
  preparedByteSize?: number;
  /** pickPhotos が返す撮影日時。既定 MOCK_TAKEN_AT。null で「撮影日時なし」。 */
  takenAt?: string | null;
};

/**
 * mock: 通信もネイティブ API も一切使わず、メモリ上の固定値で完結する（vitest / E2E 用）。
 * `expo-image-picker` 等も `react-native` も import しないため `.test.ts` から直接テストできる。
 *
 * prepareForUpload は埋め込みの本物の JPEG（`mockJpeg.ts`）を返すので、`STORAGE_MODE=fake` の
 * backend に対して写真付きのピン登録を最後まで通せる（E2E の `pin-register-photo.yaml`。SS-123）。
 * 返す幅・高さ（ピッカーの元画像を模した 4032x3024 を縮小した値）は実体の JPEG（240x180）と
 * 一致しない。backend は寸法を実体から読み直すので、mobile の値はアップロードに影響しない。
 */
export function createMockPhotoService(options?: MockPhotoServiceOptions): PhotoService {
  const count = options?.count ?? 1;
  const cancel = options?.cancel ?? false;
  const pickFailWith = options?.pickFailWith;
  const prepareFailWith = options?.prepareFailWith;
  const preparedByteSize = options?.preparedByteSize ?? MOCK_PREPARED_BYTE_SIZE;
  const takenAt = options?.takenAt === undefined ? MOCK_TAKEN_AT : options.takenAt;

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
        takenAt,
      }));
    },

    async prepareForUpload(photo): Promise<PreparedPhoto> {
      if (prepareFailWith) {
        throw new PhotoError(prepareFailWith);
      }

      const target = computeResizeTarget(photo.width, photo.height);
      const [width, height] = resizeKeepingAspectRatio(photo.width, photo.height, target);

      return {
        uri: MOCK_PREPARED_URI,
        width,
        height,
        byteSize: preparedByteSize,
        mimeType: "image/jpeg",
        // `Blob` ではなく `bytes()` を持つ形で渡す。RN の `Blob` は `Uint8Array` から作れない
        // （実機で throw する）。Expo の FormData/fetch は `bytes()` を持つ値を受け付ける
        // （`UploadFileBody` の注記。real の `expo-file-system` の `File` と同じ経路）。
        file: {
          name: "mock-photo.jpg",
          type: "image/jpeg",
          bytes: async () => mockJpegBytes(),
        },
      };
    },
  };
}

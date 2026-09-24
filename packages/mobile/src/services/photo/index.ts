import { getPhotoMode } from "@/config/photoMode";
import { createMockPhotoService } from "@/services/photo/photo.mock";
import { createRealPhotoService } from "@/services/photo/photo.real";
import type { PhotoService } from "@/services/photo/types";

export type {
  PhotoErrorCode,
  PhotoService,
  PhotoSource,
  PickedPhoto,
  PreparedPhoto,
} from "@/services/photo/types";
export { PhotoError, isPhotoError, photoErrorMessage } from "@/services/photo/photoError";

/**
 * real/mock の選択。モード判定は `getPhotoMode()` の1箇所に集約する
 * （他ファイルで `process.env.EXPO_PUBLIC_PHOTO_MODE` を読まない）。
 */
export const photoService: PhotoService =
  getPhotoMode() === "mock" ? createMockPhotoService() : createRealPhotoService();

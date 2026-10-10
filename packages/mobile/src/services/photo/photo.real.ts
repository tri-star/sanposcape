import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { toPhotoError } from "@/services/photo/photoError";
import { PHOTO_JPEG_QUALITY, computeResizeTarget } from "@/services/photo/photoResize";
import { extractTakenAtFromExif, takenAtFromDate } from "@/services/photo/photoTakenAt";
import type { PhotoService, PickedPhoto, PreparedPhoto } from "@/services/photo/types";

/**
 * ★ `asset.exif` は GPS を含みうる。ここで撮影日時の文字列に変換したら捨て、変数に持ち回さない・
 * ログに出さない（SS-163。`PickedPhoto` には `takenAt` だけを持たせる）。
 */
function toPickedPhoto(
  asset: ImagePicker.ImagePickerAsset,
  fallbackTakenAt: string | null,
): PickedPhoto {
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType ?? null,
    takenAt: extractTakenAtFromExif(asset.exif) ?? fallbackTakenAt,
  };
}

/**
 * real: `expo-image-picker` / `expo-image-manipulator` / `expo-file-system` を import してよい
 * 唯一のファイル。呼び出し側（`services/photo/index.ts` 経由）はこの実装の詳細を知らない。
 */
export function createRealPhotoService(): PhotoService {
  return {
    async pickPhotos({ source, selectionLimit }) {
      try {
        if (source === "camera") {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          if (!permission.granted) {
            throw toPhotoError(null, "permission_denied");
          }

          // quality: 1（無圧縮）にする理由: ピッカーと `prepareForUpload`（manipulator）の
          // 二重劣化を避け、圧縮は `prepareForUpload` の1回に寄せるため。
          // exif: true の理由: 撮影日時を読むため。返る EXIF には GPS も含まれうるので、
          // `toPickedPhoto` で撮影日時に変換したら捨てる。
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 1,
            exif: true,
          });
          if (result.canceled) {
            return [];
          }
          // カメラで EXIF から取れなかったときは、ピッカーが戻った時刻を撮影日時にする。
          const capturedAt = takenAtFromDate(new Date());
          return result.assets.map((asset) => toPickedPhoto(asset, capturedAt));
        }

        // library は OS の Photo Picker（Android 13+ / iOS PHPicker）を使うため権限要求しない。
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsMultipleSelection: true,
          selectionLimit,
          orderedSelection: true,
          quality: 1,
          // exif: true の理由はカメラ側のコメントと同じ（撮影日時を読むため。GPS は捨てる）。
          exif: true,
        });
        if (result.canceled) {
          return [];
        }
        const assets = selectionLimit > 0 ? result.assets.slice(0, selectionLimit) : result.assets;
        // ライブラリの写真は取れなければ null（取り込み時刻を撮影日時にすると誤りになる）。
        return assets.map((asset) => toPickedPhoto(asset, null));
      } catch (error) {
        if (source === "camera" && isCameraUnavailableError(error)) {
          throw toPhotoError(error, "camera_unavailable");
        }
        throw toPhotoError(error, "unknown");
      }
    },

    async prepareForUpload(photo): Promise<PreparedPhoto> {
      try {
        const context = ImageManipulator.manipulate(photo.uri);
        const target = computeResizeTarget(photo.width, photo.height);
        if (target !== null) {
          context.resize(target);
        }
        const image = await context.renderAsync();
        const saved = await image.saveAsync({
          compress: PHOTO_JPEG_QUALITY,
          format: SaveFormat.JPEG,
        });

        // manipulator の結果にファイルサイズが含まれないため、`expo-file-system` の
        // `File` で実測する（SDK 54+ の新 API。`new File(uri).size`）。
        // この `File` は `implements Blob`（`bytes()` / `name` / `type` を持つ）なので、
        // そのまま multipart のファイルパートに載せられる。**ここで捨てて `uri` だけを
        // 返してはいけない**（`UploadFileBody` の注記の理由。呼び出し側が
        // `{ uri, name, type }` を組み直すと Expo の fetch が送信前に落ちる）。
        const file = new File(saved.uri);
        const byteSize = file.size;
        if (!Number.isFinite(byteSize) || byteSize <= 0) {
          throw toPhotoError(null, "processing_failed");
        }

        return {
          uri: saved.uri,
          width: saved.width,
          height: saved.height,
          byteSize,
          mimeType: "image/jpeg",
          file,
        };
      } catch (error) {
        throw toPhotoError(error, "processing_failed");
      }
      // NOTE(プライバシー): EXIF（撮影位置 GPS を含む）が再エンコードで落ちるのは意図的。
      // 招待機能で他ユーザーに原本が見えるようになるため。backend 側のサーバー除去（BK-10）は
      // 招待機能の前提として別チケットで扱う。pickPhotos で exif: true にした後も、
      // アップロードするファイルの EXIF はこの再エンコードで落ちる（SS-163）。
    },
  };
}

function isCameraUnavailableError(error: unknown): boolean {
  const code =
    typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
  return code === "ERR_CAMERA_UNAVAILABLE" || code === "E_CAMERA_UNAVAILABLE";
}

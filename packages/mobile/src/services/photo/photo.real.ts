import { File } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";

import { toPhotoError } from "@/services/photo/photoError";
import { PHOTO_JPEG_QUALITY, computeResizeTarget } from "@/services/photo/photoResize";
import type { PhotoService, PickedPhoto, PreparedPhoto } from "@/services/photo/types";

function toPickedPhoto(asset: ImagePicker.ImagePickerAsset): PickedPhoto {
  return {
    uri: asset.uri,
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType ?? null,
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
          const result = await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 1,
            exif: false,
          });
          if (result.canceled) {
            return [];
          }
          return result.assets.map(toPickedPhoto);
        }

        // library は OS の Photo Picker（Android 13+ / iOS PHPicker）を使うため権限要求しない。
        const result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsMultipleSelection: true,
          selectionLimit,
          orderedSelection: true,
          quality: 1,
          exif: false,
        });
        if (result.canceled) {
          return [];
        }
        const assets = selectionLimit > 0 ? result.assets.slice(0, selectionLimit) : result.assets;
        return assets.map(toPickedPhoto);
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
      // 招待機能の前提として別チケットで扱う。
    },
  };
}

function isCameraUnavailableError(error: unknown): boolean {
  const code =
    typeof error === "object" && error !== null ? (error as { code?: unknown }).code : null;
  return code === "ERR_CAMERA_UNAVAILABLE" || code === "E_CAMERA_UNAVAILABLE";
}

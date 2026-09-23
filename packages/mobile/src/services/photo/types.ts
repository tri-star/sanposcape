export type PhotoSource = "camera" | "library";

/** ピッカーが返した元画像（加工前）。 */
export type PickedPhoto = {
  uri: string;
  width: number;
  height: number;
  /** HEIC の場合もある（加工で JPEG にする）。 */
  mimeType: string | null;
};

/**
 * multipart のファイルパートとして送れる画像の実体。
 *
 * **`{ uri, name, type }`（React Native 独自の形）は使えない。** Expo SDK 54+ は WinterCG の
 * `fetch` を global に載せており、その FormData 変換（`expo/src/winter/fetch/convertFormData.ts`）
 * は `uri` 形式を受け付けず `Error: Unsupported FormDataPart implementation` を投げる
 * （リクエストは1バイトも送信されない）。SS-88 の実機・エミュレータで再現・確認済み。
 * 受け付けられるのは `Blob` そのものか、`bytes()` を持つオブジェクト（`expo-file-system` の
 * `File` が該当）だけなので、型でそれを強制する。
 */
export type UploadFileBody =
  | Blob
  | {
      readonly name?: string;
      readonly type?: string;
      bytes(): Promise<Uint8Array>;
    };

/** アップロード用に縮小・再圧縮した画像。常に JPEG。EXIF は再エンコードで落ちる。 */
export type PreparedPhoto = {
  uri: string;
  width: number;
  height: number;
  /** 加工後ファイルのバイト数（枠の申請・上限チェックに使う）。 */
  byteSize: number;
  mimeType: "image/jpeg";
  /**
   * 直送（presigned POST）でそのまま multipart に載せる実体。
   * `uri` から呼び出し側が組み立て直さないこと（上の `UploadFileBody` の注記の理由）。
   */
  file: UploadFileBody;
};

export type PickPhotosOptions = {
  source: PhotoSource;
  /**
   * library のときの最大選択枚数。0 は「上限なし」（expo-image-picker の既定と同じ意味）。
   * ピンの写真枚数は無制限なので、呼び出し側は通常 0 を渡す。camera は常に1枚。
   */
  selectionLimit: number;
};

/**
 * 写真サービスのインターフェース。
 * 呼び出し側（features/pin）はこれのみを参照し、real/mock の実体を知らない。
 */
export type PhotoService = {
  /**
   * 写真を撮影/選択する。キャンセルは空配列（エラーにしない）。
   * camera は権限が無ければ要求し、拒否なら PhotoError("permission_denied")。
   * library は OS の Photo Picker（Android 13+ / iOS PHPicker）を使うため権限要求しない。
   */
  pickPhotos(options: PickPhotosOptions): Promise<PickedPhoto[]>;
  /** 長辺を PHOTO_MAX_EDGE_PX に縮小（拡大はしない）し、JPEG（PHOTO_JPEG_QUALITY）で保存する。 */
  prepareForUpload(photo: PickedPhoto): Promise<PreparedPhoto>;
};

export type PhotoErrorCode =
  | "permission_denied"
  | "camera_unavailable"
  | "processing_failed"
  | "unknown";

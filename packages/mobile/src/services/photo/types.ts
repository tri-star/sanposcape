export type PhotoSource = "camera" | "library";

/** ピッカーが返した元画像（加工前）。 */
export type PickedPhoto = {
  uri: string;
  width: number;
  height: number;
  /** HEIC の場合もある（加工で JPEG にする）。 */
  mimeType: string | null;
};

/** アップロード用に縮小・再圧縮した画像。常に JPEG。EXIF は再エンコードで落ちる。 */
export type PreparedPhoto = {
  uri: string;
  width: number;
  height: number;
  /** 加工後ファイルのバイト数（枠の申請・上限チェックに使う）。 */
  byteSize: number;
  mimeType: "image/jpeg";
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

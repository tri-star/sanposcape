import type { PhotoUploadErrorCode } from "@/features/pin/lib/photoUploadError";
import type { GeoCoordinates } from "@/services/location/types";
import type { PickedPhoto, PreparedPhoto } from "@/services/photo/types";

/** 画面で扱う地図（SanpoMapRead を camelCase 化）。件数は API に無い（地図管理チケットで expand）。 */
export type SanpoMap = {
  id: string;
  name: string;
  /** リクエストユーザーにとっての既定地図か（他人の既定地図に招待された場合は false）。 */
  isDefault: boolean;
  /** MVP では owner のみ出現。招待機能で editor が増える前提で型に持つ。 */
  role: "owner" | "editor";
};

/** 保存先の選択。"default" は sanpo_map_id を送らない＝自分の既定地図（無ければ「最初の地図」を作る）。 */
export type SanpoMapSelection = { kind: "default" } | { kind: "existing"; sanpoMapId: string };

/** 登録フォームの入力値（写真以外）。 */
export type PinDraft = {
  name: string;
  memo: string;
  tags: string[];
  sanpoMapSelection: SanpoMapSelection;
};

/**
 * 写真1枚の状態。
 * - processing: 端末で縮小・再圧縮中（まだ prepared が無い）
 * - waiting: 加工済み。枠が空くのを待っている（先行アップロードの上限超過・429 を受けた・保存フローの順番待ち）
 * - uploading: 枠発行 → 直送の最中
 * - uploaded: S3 にあり、まだピンに紐付いていない（backend の「未使用枠」を1つ占有している）
 * - attached: ピンに紐付いた（枠は解放された）
 * - failed: 送れない（ユーザーが再試行 or 削除する）
 */
export type PhotoDraftStatus =
  | "processing"
  | "waiting"
  | "uploading"
  | "uploaded"
  | "attached"
  | "failed";

/** 写真1枚の状態。localId は画面内だけの識別子（randomUuidV4）。 */
export type PhotoDraftItem = {
  localId: string;
  previewUri: string;
  picked: PickedPhoto;
  prepared: PreparedPhoto | null;
  status: PhotoDraftStatus;
  /** アップロード枠 ID（uploaded / attached のとき非 null）。 */
  uploadId: string | null;
  errorCode: PhotoUploadErrorCode | null;
};

/** アップロード枠（presigned POST）。 */
export type PinPhotoUploadTicket = {
  uploadId: string;
  url: string;
  /** フォームにそのまま載せるフィールド。順序を保持する。 */
  fields: Array<[string, string]>;
  expiresAt: string;
  /** 1枚の上限（バイト）。**これが正**（クライアントの定数はフォールバック）。 */
  maxByteSize: number;
};

/**
 * 保存成功時に画面が必要とする最小限（詳細表示・サムネイル表示は別チケット）。
 *
 * NOTE: `PinRead.photos[].thumbnail`（nullable presigned GET）・`urls_expire_at` は登録画面では
 * 使わない（ローカル画像を表示する）ため、この型にも含めない。SS-118 で閲覧側の型（`PinPhoto` /
 * `PinDetail` 等）を追加した。画像キャッシュのキーは URL ではなく `photo.id`
 * （`@/features/pin/lib/pinPhotoCache` の `pinPhotoCacheKey`）を使う。presigned URL は
 * 応答ごとに変わりうるため。
 */
export type SavedPin = {
  id: string;
  sanpoMapId: string;
  sanpoMapName: string;
  /** サーバーが数えたピンの写真総数。 */
  photoCount: number;
};

export type PinSaveStatus = "idle" | "saving" | "saved" | "error";

/** 保存の進捗（View の表示用）。sent = attached 枚数、total = 削除されていない写真の総数。 */
export type PinSaveProgress =
  | { step: "creating" }
  | { step: "sending_photos"; sent: number; total: number };

// --- SS-118: 閲覧（地図表示・詳細画面）で使う型 ---

/** 緯度経度の矩形（bbox）。south <= north・west <= east（日付変更線をまたぐ範囲は扱わない）。 */
export type GeoBounds = { south: number; west: number; north: number; east: number };

/** 地図に描くピン1件（`PinListItemRead` の必要部分。SS-120 で項目を足してよい）。 */
export type PinSummary = {
  id: string;
  sanpoMapId: string;
  /** null は「名前なし」。表示名は pinDisplayName() を通す。 */
  name: string | null;
  location: GeoCoordinates;
};

/** 表示用の写真1枚。URL は許可判定（isAllowedUploadUrl）を通したもの。不可・未生成は null。 */
export type PinPhoto = {
  id: string;
  position: number;
  thumbnailUrl: string | null;
  originalUrl: string | null;
  width: number;
  height: number;
};

export type PinTagView = { id: string; label: string };

/** 詳細画面が必要とする情報（`PinRead` を camelCase 化）。 */
export type PinDetail = {
  id: string;
  name: string | null;
  memo: string | null;
  location: GeoCoordinates;
  tags: PinTagView[];
  /** position 順の先頭（最大10件）。全件は GET /pins/{id}/photos。 */
  photos: PinPhoto[];
  photoCount: number;
  sanpoMapName: string;
  /** ISO 文字列（表示整形は lib 側）。 */
  createdAt: string;
};

/** 写真ページ1枚分（GET /pins/{id}/photos）。 */
export type PinPhotoPage = { items: PinPhoto[]; photoCount: number; nextCursor: string | null };

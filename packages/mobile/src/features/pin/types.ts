import type { PhotoUploadErrorCode } from "@/features/pin/lib/photoUploadError";
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
 * NOTE: `PinRead.photos[].thumbnail`（nullable presigned GET）・`urls_expire_at` は MVP の
 * 登録画面では使わない（ローカル画像を表示する）ため、この型にも含めない。閲覧チケットで
 * 使うときは、画像キャッシュのキーを URL ではなく `photo.id` にすること（backend-plan 5.10）。
 * presigned URL は応答ごとに変わりうるため。
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

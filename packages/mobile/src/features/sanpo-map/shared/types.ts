import type { SanpoMapIcon } from "@/api/generated/model";
import type { GeoCoordinates } from "@/services/location/types";

/*
 * 地図・ピン・招待の2つ以上の領域から使う型だけを置く（ADR-M-001 決定2 の SS-260 追補）。
 * 1つの領域だけが使う型は、その領域の types.ts（`pin/types.ts`・`invitation/types.ts`）に置く。
 * `PinPhoto`・`PinTagView` は直接はピンだけが使うが、地図詳細の一覧の `PinListEntry` の一部なのでここに置く。
 */

/** 画面で扱う地図アイコンの値（= backend の enum。対応表は lib/sanpoMapIcon.ts）。 */
export type SanpoMapIconKey = SanpoMapIcon;

/** 地図のメンバー（`GET /sanpo-maps/{id}/members`。SS-249）。 */
export type SanpoMapMember = {
  userId: string;
  /** 表示名。未設定は null（表示は `sanpoMapMemberDisplayName` で「メンバー」にする）。 */
  displayName: string | null;
  role: "owner" | "editor";
  /** ISO 8601。メンバーになった日時（owner は地図の作成日時）。 */
  joinedAt: string;
};

/** 画面で扱う地図（SanpoMapRead を camelCase 化）。 */
export type SanpoMap = {
  id: string;
  name: string;
  /** リクエストユーザーにとっての既定地図か（他人の既定地図に招待された場合は false）。 */
  isDefault: boolean;
  /** MVP では owner のみ出現。招待機能で editor が増える前提で型に持つ。 */
  role: "owner" | "editor";
  /** 地図のピン件数（`GET /sanpo-maps?expand=pin_count`）。作成直後は 0。値が無い（null）ときは表示しない。 */
  pinCount: number | null;
  /** 地図のアイコン（SS-171）。API の値を toSanpoMapIconKey で検証済み。 */
  icon: SanpoMapIconKey;
  /**
   * この地図のピンを、自分のピンタブ・ナビタブの地図に出すか（SS-266）。自分のメンバーシップの値で、
   * ほかのメンバーの選択とは独立。
   */
  pinsVisible: boolean;
};

// --- SS-118: 閲覧（地図表示・詳細画面）で使う型 ---

/** `GET /pins` に送る絞り込みの条件。キーが無いものは「両方」（backend は絞らない）。 */
export type PinListFilterParams = {
  archived?: false;
  visited?: boolean;
};

/** 緯度経度の矩形（bbox）。south <= north・west <= east（日付変更線をまたぐ範囲は扱わない）。 */
export type GeoBounds = { south: number; west: number; north: number; east: number };

/** 地図に描くピン1件（`PinListItemRead` の必要部分。SS-120 で項目を足してよい）。 */
export type PinSummary = {
  id: string;
  sanpoMapId: string;
  /** null は「名前なし」。表示名は pinDisplayName() を通す。 */
  name: string | null;
  location: GeoCoordinates;
  /**
   * アーカイブ済みか。地図の絞り込みで「アーカイブ済みも表示」にしたときだけ true のピンが来る
   * （マーカーを半透明にして見分ける。SS-174）。読み方は `toPinListEntry` と同じ `=== true`。
   */
  archived: boolean;
};

/** 地図に描く登録済みピン（PinSummary + そのピンの地図のアイコン。SS-172）。 */
export type RegisteredPin = PinSummary & { sanpoMapIcon: SanpoMapIconKey };

/** 表示用の写真1枚。URL は許可判定（isAllowedUploadUrl）を通したもの。不可・未生成は null。 */
export type PinPhoto = {
  id: string;
  position: number;
  thumbnailUrl: string | null;
  originalUrl: string | null;
  width: number;
  height: number;
  /** アップロードしたユーザー。写真の削除権限の判定に使う（SS-119）。 */
  uploadedByUserId: string;
  /**
   * 撮影日時（`PinPhotoRead.taken_at`。UTC 換算の ISO 文字列。送ったときのオフセットは backend が保持しない）。
   * 端末が EXIF から読んで送ったもの。取れなかった写真・SS-163 以前の写真は null
   * （表示は uploadedAt にフォールバック。`resolveViewerPhotoDate`）。表示は端末のタイムゾーン。
   */
  takenAt: string | null;
  /**
   * ピンに紐付いた日時（`PinPhotoRead.created_at`。ISO 文字列）。確定処理の開始時刻なので、
   * 同じ保存で紐付けた写真は同じ値になる。
   */
  uploadedAt: string;
};

/** タグ1件。`createdByUserId` はタグの削除権限の判定に使う（SS-119）。 */
export type PinTagView = { id: string; label: string; createdByUserId: string };

/** 地図詳細のピン一覧の1件（`PinListItemRead` の必要部分。SS-121）。 */
export type PinListEntry = {
  id: string;
  /** null は「名前なし」。表示名は pinDisplayName() を通す。 */
  name: string | null;
  tags: PinTagView[];
  /** 代表写真（position 最小）。無ければ null。URL は isAllowedUploadUrl を通したもの。 */
  coverPhoto: PinPhoto | null;
  photoCount: number;
  /** ISO 文字列。 */
  createdAt: string;
  /** 訪問済みか（ピン単位。地図のメンバーで共有。SS-173）。 */
  visited: boolean;
  /** アーカイブ済みか。アーカイブ済みは地図表示から除外される（SS-173。ADR-M-021）。 */
  archived: boolean;
};

import type { GeoCoordinates } from "@/services/location/types";
import type { PinPhoto, PinTagView, SanpoMapMember } from "@/features/sanpo-map/shared/types";

/**
 * ピン（登録・編集・詳細・タグの候補・移動先）だけが使う型（SS-260 で旧 `features/pin/types.ts` から分けた）。
 * 地図・招待からも使う型は `@/features/sanpo-map/shared/types` に置く（ADR-M-001 決定2 の SS-260 追補）。
 */

/**
 * ピンの移動先の候補（`GET /pins/{pin_id}/move-targets`。ルート ADR-009 決定42, SS-192）。
 * - `missingMembers`: 今の地図のメンバーで、この地図に参加していない人。1人でもいれば移せない
 * - `addedMembers`: この地図にだけいる人（移すと新しくピンが見えるようになる。移動は止めない）
 */
export type PinMoveTarget = {
  sanpoMapId: string;
  missingMembers: Pick<SanpoMapMember, "userId" | "displayName">[];
  addedMembers: Pick<SanpoMapMember, "userId" | "displayName">[];
};

/** 保存先の選択。"default" は sanpo_map_id を送らない＝自分の既定地図（無ければ「最初の地図」を作る）。 */
export type SanpoMapSelection = { kind: "default" } | { kind: "existing"; sanpoMapId: string };

/** 登録フォームの入力値（写真以外）。 */
export type PinDraft = {
  name: string;
  memo: string;
  tags: string[];
  sanpoMapSelection: SanpoMapSelection;
  /** 訪問済みか。初期値は resolveInitialVisited（散歩中の登録は true、ピンタブの長押しは false。SS-173）。 */
  visited: boolean;
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
 * （`@/features/sanpo-map/pin/lib/pinPhotoCache` の `pinPhotoCacheKey`）を使う。presigned URL は
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

/** 地図における自分の役割（`SanpoMap.role` と同じ値）。null は「不明」として別に扱う。 */
export type PinMemberRole = "owner" | "editor";

/** 詳細画面が必要とする情報（`PinRead` を camelCase 化）。 */
export type PinDetail = {
  id: string;
  name: string | null;
  memo: string | null;
  location: GeoCoordinates;
  /** 権限判定（地図の role を引く）に使う。 */
  sanpoMapId: string;
  /** ピンの作成者。名前・メモの更新とピンの削除の権限判定に使う。 */
  createdByUserId: string;
  tags: PinTagView[];
  /** position 順の先頭（最大10件）。全件は GET /pins/{id}/photos。 */
  photos: PinPhoto[];
  photoCount: number;
  sanpoMapName: string;
  /** ISO 文字列（表示整形は lib 側）。 */
  createdAt: string;
  /** 訪問済みか（ピン単位。地図のメンバーで共有。SS-173）。 */
  visited: boolean;
  /** アーカイブ済みか。アーカイブ済みは地図表示から除外される（SS-173。ADR-M-021）。 */
  archived: boolean;
};

/** 写真ページ1枚分（GET /pins/{id}/photos）。 */
export type PinPhotoPage = { items: PinPhoto[]; photoCount: number; nextCursor: string | null };

/**
 * タグの候補1件（`GET /sanpo-maps/{id}/tags` の `SanpoMapTagRead` を camelCase 化。SS-136）。
 * `label` は backend が選んだ代表表記（同じキーのタグのうち最後に付けられた表記。
 * `pin_tags.created_at DESC, id DESC` の先頭。ルート ADR-009 SS-136 追補）。
 */
export type TagSuggestion = {
  label: string;
  /**
   * その地図でこのタグが付いているピンの数。並び順は backend が決めるので mobile は並べ替えに
   * 使わない。現状は未使用で、ピン数の表示など SS-120（検索タブ）での利用を想定して保持している。
   */
  pinCount: number;
};

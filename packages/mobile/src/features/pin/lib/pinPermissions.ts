import type {
  PinDetail,
  PinMemberRole,
  PinPhoto,
  PinTagView,
  SanpoMap,
} from "@/features/pin/types";

/**
 * ピンの編集・削除の権限判定（UI の出し分け用）。ルート ADR-009 決定19 の権限マトリクスを写す。
 * backend `sanpo_maps/permissions.py` の3分類と対応する。
 *
 * - 追加系（タグの追加・写真の追加・訪問状況の変更）: メンバーなら誰でも可 → 常に true
 * - 持ち主判定系（名前・メモの更新、アーカイブの変更、ピンの削除、タグ・写真の削除）: 地図 owner か、対象の作成者本人
 * - 地図管理系: `canManageSanpoMap`（SS-171。owner のみ）
 *
 * 訪問状況・アーカイブの割り当て（SS-173）は backend の `can_update_pin_visited` /
 * `can_update_pin_archived`（ルート ADR-009 決定32）に合わせている。backend が変わればこのファイルの
 * `canEditVisited` / `canArchive` の2行だけ直す。
 *
 * **UI 用の判定であり、安全性は backend の 403 が担保する**。誤って出し分けても、
 * 権限の無い操作は backend が拒否する。
 */
export type PinPermissionContext = {
  /** 地図における自分の役割。null = 不明。不明は editor（メンバーの最小権限）とみなす。 */
  role: PinMemberRole | null;
  currentUserId: string | null;
};

export type PinPermissions = {
  /** name / memo の更新。 */
  canEditFields: boolean;
  canDeletePin: boolean;
  canAddTags: boolean;
  canAddPhotos: boolean;
  /** 訪問状況の変更（メンバーなら誰でも。追加系と同じ。SS-173）。 */
  canEditVisited: boolean;
  /** アーカイブの変更（地図 owner かピンの作成者本人。持ち主判定系。SS-173）。 */
  canArchive: boolean;
  /** 詳細ヘッダーの編集ボタンを出すか（メンバーなら常に true）。 */
  canOpenEditor: boolean;
};

/** `GET /sanpo-maps` の一覧から、ピンの地図における自分の role を引く。無ければ null（不明）。 */
export function resolvePinRole(
  maps: readonly Pick<SanpoMap, "id" | "role">[],
  sanpoMapId: string,
): PinMemberRole | null {
  return maps.find((map) => map.id === sanpoMapId)?.role ?? null;
}

function isOwner(ctx: PinPermissionContext): boolean {
  // 不明（null）は editor とみなす。owner だけが特別扱いされる。
  return ctx.role === "owner";
}

function isOwnedBy(ctx: PinPermissionContext, userId: string): boolean {
  return ctx.currentUserId !== null && ctx.currentUserId === userId;
}

/** 持ち主判定系の操作ができるか: 地図 owner か、対象の作成者本人。 */
function canManage(ctx: PinPermissionContext, ownerUserId: string): boolean {
  return isOwner(ctx) || isOwnedBy(ctx, ownerUserId);
}

export function resolvePinPermissions(
  ctx: PinPermissionContext,
  pin: Pick<PinDetail, "createdByUserId">,
): PinPermissions {
  const canManagePin = canManage(ctx, pin.createdByUserId);
  const canAddTags = true;
  const canAddPhotos = true;
  return {
    canEditFields: canManagePin,
    canDeletePin: canManagePin,
    canAddTags,
    canAddPhotos,
    canEditVisited: true,
    canArchive: canManagePin,
    canOpenEditor: canManagePin || canAddTags || canAddPhotos,
  };
}

/** タグを外せるか。「作成者」はタグを付けた人（ピンの作成者ではない）。 */
export function canRemovePinTag(
  ctx: PinPermissionContext,
  tag: Pick<PinTagView, "createdByUserId">,
): boolean {
  return canManage(ctx, tag.createdByUserId);
}

/** 写真を削除できるか。「作成者」は写真をアップロードした人。 */
export function canDeletePinPhoto(
  ctx: PinPermissionContext,
  photo: Pick<PinPhoto, "uploadedByUserId">,
): boolean {
  return canManage(ctx, photo.uploadedByUserId);
}

/**
 * 地図そのものの管理（アイコンの変更。将来は名前変更・削除）ができるか: 地図 owner だけ（SS-171）。
 * 不明（null）は editor とみなして false（ADR-M-017 の「不明は最小権限」）。UI 用で、安全性は backend の 403 が担保する。
 */
export function canManageSanpoMap(role: PinMemberRole | null): boolean {
  return role === "owner";
}

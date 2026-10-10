import type { PinUpdate } from "@/api/generated/model";
import {
  resolveSaveAvailability,
  type PinDraftFieldErrors,
} from "@/features/pin/lib/pinDraftValidation";
import type { PinPermissions } from "@/features/pin/lib/pinPermissions";
import { tagKey } from "@/features/pin/lib/pinTags";
import type { PhotoDraftItem, PinDetail, PinTagView } from "@/features/pin/types";

/** 編集開始時点のピン（差分の基準）。画面を開いて最初に詳細が取れた時点で1回だけ作る。 */
export type PinEditBaseline = {
  /** null は "" に直す。 */
  name: string;
  memo: string;
  tags: readonly PinTagView[];
  /** 訪問済みか（SS-173）。 */
  visited: boolean;
  /** アーカイブ済みか（SS-173）。 */
  archived: boolean;
  /** ピンが今属している地図（差分の基準。SS-175）。部分保存後は PATCH の応答で作り直される。 */
  sanpoMapId: string;
  /** その地図の名前（地図一覧に無いときの表示の代わり。差分の比較には使わない）。 */
  sanpoMapName: string;
};

export type PinEditDraft = {
  name: string;
  memo: string;
  visited: boolean;
  archived: boolean;
  /** 選んでいる地図（SS-175）。 */
  sanpoMapId: string;
  /** 表示順のタグのラベル（既存 + 追加）。 */
  tags: string[];
  /** 削除の印を付けた既存写真の id。 */
  photoIdsToDelete: string[];
};

export function createPinEditBaseline(pin: PinDetail): PinEditBaseline {
  return {
    name: pin.name ?? "",
    memo: pin.memo ?? "",
    tags: pin.tags,
    visited: pin.visited,
    archived: pin.archived,
    sanpoMapId: pin.sanpoMapId,
    sanpoMapName: pin.sanpoMapName,
  };
}

export function initialPinEditDraft(baseline: PinEditBaseline): PinEditDraft {
  return {
    name: baseline.name,
    memo: baseline.memo,
    visited: baseline.visited,
    archived: baseline.archived,
    sanpoMapId: baseline.sanpoMapId,
    tags: baseline.tags.map((tag) => tag.label),
    photoIdsToDelete: [],
  };
}

/**
 * `PATCH /pins/{id}` のボディ。変更が無ければ `{}`。
 * - name / memo: trim 後に基準値と違うときだけ入れる。空なら null（消去）。
 *   `permissions.canEditFields` が false なら入れない（多層防御。値が同じでも送ると権限判定が走る）。
 * - visited / archived（SS-173）: 基準値と違うときだけ入れる（値が同じなら送らない＝backend の権限判定を
 *   走らせない）。`canEditVisited` / `canArchive` が false なら入れない（多層防御）。
 * - sanpo_map_id（SS-175）: 基準値と違うときだけ入れる。`canChangeSanpoMap` が false なら入れない（多層防御）。
 *   null は送らない。
 * - remove_tag_ids: 基準タグのうち、tagKey が下書きに無いもの。`canRemoveTag` が false のタグは除く。
 * - add_tags: 下書きのラベルのうち、tagKey が基準に無いもの。
 * - 空配列のキーは送らない（「変更したフィールドだけ」。ADR-009 伝達事項）。
 *
 * 同じキーのタグを消して付け直した場合は差分ゼロになる（backend の「削除してから追加」で
 * 作成者が付け替わるのを避ける）。表記だけの違い（Cafe → cafe）は反映しない（ADR-M-017）。
 */
export function buildPinUpdateRequest(input: {
  baseline: PinEditBaseline;
  draft: PinEditDraft;
  permissions: Pick<
    PinPermissions,
    "canEditFields" | "canEditVisited" | "canArchive" | "canChangeSanpoMap"
  >;
  canRemoveTag: (tag: PinTagView) => boolean;
}): PinUpdate {
  const { baseline, draft } = input;
  const request: PinUpdate = {};

  if (input.permissions.canEditFields) {
    const name = draft.name.trim();
    if (name !== baseline.name.trim()) {
      request.name = name.length === 0 ? null : name;
    }
    const memo = draft.memo.trim();
    if (memo !== baseline.memo.trim()) {
      request.memo = memo.length === 0 ? null : memo;
    }
  }

  if (input.permissions.canEditVisited && draft.visited !== baseline.visited) {
    request.visited = draft.visited;
  }
  if (input.permissions.canArchive && draft.archived !== baseline.archived) {
    request.archived = draft.archived;
  }
  if (input.permissions.canChangeSanpoMap && draft.sanpoMapId !== baseline.sanpoMapId) {
    request.sanpo_map_id = draft.sanpoMapId;
  }

  const draftKeys = new Set(draft.tags.map(tagKey));
  const baselineKeys = new Set(baseline.tags.map((tag) => tagKey(tag.label)));

  const removeTagIds = baseline.tags
    .filter((tag) => !draftKeys.has(tagKey(tag.label)) && input.canRemoveTag(tag))
    .map((tag) => tag.id);
  if (removeTagIds.length > 0) {
    request.remove_tag_ids = removeTagIds;
  }

  const addTags = draft.tags.filter((label) => !baselineKeys.has(tagKey(label)));
  if (addTags.length > 0) {
    request.add_tags = addTags;
  }

  return request;
}

export function isEmptyPinUpdate(request: PinUpdate): boolean {
  return Object.keys(request).length === 0;
}

/** 破棄確認・保存ボタンの有効化に使う。差分 or 削除の印 or 追加写真があれば true。 */
export function hasUnsavedPinEdit(input: {
  baseline: PinEditBaseline;
  draft: PinEditDraft;
  newPhotoCount: number;
}): boolean {
  // 権限による除外は考えない（入力欄が無効なら下書きも変わらない）。
  const request = buildPinUpdateRequest({
    baseline: input.baseline,
    draft: input.draft,
    permissions: {
      canEditFields: true,
      canEditVisited: true,
      canArchive: true,
      canChangeSanpoMap: true,
    },
    canRemoveTag: () => true,
  });
  return (
    !isEmptyPinUpdate(request) || input.draft.photoIdsToDelete.length > 0 || input.newPhotoCount > 0
  );
}

/** 削除の印の付け外し。 */
export function togglePhotoDeletion(ids: readonly string[], photoId: string): string[] {
  return ids.includes(photoId) ? ids.filter((id) => id !== photoId) : [...ids, photoId];
}

/** 下書きのラベルが削除できるか（基準タグにキーで一致すれば権限で判定、新規タグは常に true）。 */
export function isDraftTagRemovable(
  label: string,
  baseline: PinEditBaseline,
  canRemoveTag: (tag: PinTagView) => boolean,
): boolean {
  const key = tagKey(label);
  const existing = baseline.tags.find((tag) => tagKey(tag.label) === key);
  return existing === undefined ? true : canRemoveTag(existing);
}

export type PinEditSaveAvailability =
  | { canSave: true }
  | {
      canSave: false;
      reason: "saving" | "no_changes" | "field_error" | "photos_preparing" | "photos_failed";
    };

/**
 * 保存可否。優先順位: saving > no_changes > field_error > photos_preparing > photos_failed。
 * field_error / photos_* は既存の `resolveSaveAvailability` に委ねる。
 */
export function resolvePinEditSaveAvailability(input: {
  fieldErrors: PinDraftFieldErrors;
  photos: readonly Pick<PhotoDraftItem, "status">[];
  isSaving: boolean;
  hasChanges: boolean;
}): PinEditSaveAvailability {
  if (input.isSaving) {
    return { canSave: false, reason: "saving" };
  }
  if (!input.hasChanges) {
    return { canSave: false, reason: "no_changes" };
  }
  return resolveSaveAvailability({
    fieldErrors: input.fieldErrors,
    photos: input.photos,
    isSaving: false,
  });
}

import { useState } from "react";

import { usePinDetail, type UsePinDetailResult } from "@/features/pin/hooks/usePinDetail";
import { usePinEditSave, type UsePinEditSaveResult } from "@/features/pin/hooks/usePinEditSave";
import { usePinPhotos, type UsePinPhotosResult } from "@/features/pin/hooks/usePinPhotos";
import { usePinTagSuggestions } from "@/features/pin/hooks/usePinTagSuggestions";
import { useSanpoMaps } from "@/features/pin/hooks/useSanpoMaps";
import {
  buildPinUpdateRequest,
  createPinEditBaseline,
  hasUnsavedPinEdit,
  initialPinEditDraft,
  isDraftTagRemovable,
  resolvePinEditSaveAvailability,
  togglePhotoDeletion as toggleDeletionMark,
  type PinEditBaseline,
  type PinEditDraft,
  type PinEditSaveAvailability,
} from "@/features/pin/lib/pinEditDraft";
import {
  addDeletedPhotoId,
  canConfirmPinEditBaseline,
  excludeDeletedPhotos,
  rebaseBaselineAfterUpdate,
  rebaseDraftAfterPhotoDeleted,
} from "@/features/pin/lib/pinEditSync";
import {
  validatePinDraftFields,
  type PinDraftFieldErrors,
} from "@/features/pin/lib/pinDraftValidation";
import {
  canDeletePinPhoto,
  canRemovePinTag,
  resolvePinPermissions,
  resolvePinRole,
  type PinPermissionContext,
  type PinPermissions,
} from "@/features/pin/lib/pinPermissions";
import { filterTagSuggestions, resolveTagLabelForAdd } from "@/features/pin/lib/pinTagSuggestions";
import { addTag, addTagErrorMessage, removeTag as removeTagFrom } from "@/features/pin/lib/pinTags";
import type { PinPhoto, TagSuggestion } from "@/features/pin/types";

export type UsePinEditOptions = {
  /** ルートで isUuid を通した値。不正なら null。 */
  pinId: string | null;
  isSignedIn: boolean;
  /** ルートが認証ストアから読んで注入する（features/pin は認証ストアを import できない）。 */
  currentUserId: string | null;
  onSaved: () => void;
  onPickerError: (message: string) => void;
};

export type PinEditExistingPhoto = {
  photo: PinPhoto;
  markedForDeletion: boolean;
  /** 削除の印を付けられるか（権限）。 */
  deletable: boolean;
};

export type UsePinEditResult = {
  /** 本文の状態判定と既存写真のページングに使う。 */
  detail: UsePinDetailResult;
  /** null = まだ詳細が取れていない。 */
  baseline: PinEditBaseline | null;
  draft: PinEditDraft;
  /** null = まだ詳細が取れていない（この間は本文を描画しないので使われない）。 */
  permissions: PinPermissions | null;
  setName: (v: string) => void;
  setMemo: (v: string) => void;
  setVisited: (v: boolean) => void;
  setArchived: (v: boolean) => void;
  tagInput: string;
  setTagInput: (v: string) => void;
  tagError: string | null;
  tagSuggestions: TagSuggestion[];
  addTagFromInput: () => void;
  addTagFromSuggestion: (label: string) => void;
  removeTag: (label: string) => void;
  canRemoveTag: (label: string) => boolean;
  existingPhotos: PinEditExistingPhoto[];
  togglePhotoDeletion: (photoId: string) => void;
  newPhotos: UsePinPhotosResult;
  fieldErrors: PinDraftFieldErrors;
  saveAvailability: PinEditSaveAvailability;
  save: UsePinEditSaveResult;
  submit: () => void;
  hasUnsavedChanges: boolean;
};

const EMPTY_DRAFT: PinEditDraft = {
  name: "",
  memo: "",
  visited: false,
  archived: false,
  tags: [],
  photoIdsToDelete: [],
};

/**
 * ピン編集画面が必要とするものを1つに束ねる合成 hook（`usePinRegister` と同じ位置づけ）。
 * 判定・整形・差分の計算はすべて `lib/` に委ね、ここは状態の保持と配線だけを行う。
 *
 * React Compiler がビルド時に自動メモ化するため、手動の useCallback は付けない（`usePinRegister` と同じ）。
 */
export function usePinEdit(options: UsePinEditOptions): UsePinEditResult {
  const detail = usePinDetail(options.pinId, { enabled: options.isSignedIn });
  const pin = detail.pin;

  // 基準値と下書きは、詳細が「新しく」取れた時点で1回だけレンダー中に確定する
  // （docs/architecture-guideline.md「1回だけの状態確定」）。詳細を取り直しても入力を消さない。
  // invalidate 済みの古いキャッシュで確定しないよう、再取得が終わるまで待つ（A-2）。
  // 部分保存の後は、PATCH の成功応答で基準値を作り直す（A-1。`onPinUpdated`）。
  const [baseline, setBaseline] = useState<PinEditBaseline | null>(null);
  const [draft, setDraft] = useState<PinEditDraft>(EMPTY_DRAFT);
  // この画面で DELETE に成功した写真（既存写真の表示から外す。A-1）。
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<readonly string[]>([]);
  if (
    baseline === null &&
    pin !== null &&
    canConfirmPinEditBaseline({
      hasPin: true,
      isFetching: detail.isFetching,
      hasError: detail.errorCode !== null,
    })
  ) {
    const created = createPinEditBaseline(pin);
    setBaseline(created);
    setDraft(initialPinEditDraft(created));
  }

  const [tagInput, setTagInputState] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);

  // 権限: 地図の role は GET /sanpo-maps のキャッシュから引く（不明は editor 扱い。ADR-M-017）。
  const sanpoMapsQuery = useSanpoMaps({ enabled: options.isSignedIn });
  const ctx: PinPermissionContext = {
    role: pin !== null ? resolvePinRole(sanpoMapsQuery.maps, pin.sanpoMapId) : null,
    currentUserId: options.currentUserId,
  };
  const permissions = pin !== null ? resolvePinPermissions(ctx, pin) : null;

  const tagSuggestionsQuery = usePinTagSuggestions({
    sanpoMapId: pin?.sanpoMapId ?? null,
    enabled: options.isSignedIn,
  });
  const tagSuggestions = filterTagSuggestions({
    candidates: tagSuggestionsQuery.candidates,
    query: tagInput,
    attached: draft.tags,
  });

  const photosBase = usePinPhotos({
    enabled: options.isSignedIn,
    onPickerError: options.onPickerError,
  });

  const save = usePinEditSave({
    pinId: options.pinId,
    photos: photosBase.saveBridge,
    onSaved: options.onSaved,
    onPinUpdated: (updated) => setBaseline(rebaseBaselineAfterUpdate(updated)),
    onPhotoDeleted: (photoId) => {
      setDeletedPhotoIds((prev) => addDeletedPhotoId(prev, photoId));
      setDraft((prev) => rebaseDraftAfterPhotoDeleted(prev, photoId));
    },
  });

  const fieldErrors = validatePinDraftFields(draft);
  const hasUnsavedChanges =
    baseline !== null &&
    hasUnsavedPinEdit({ baseline, draft, newPhotoCount: photosBase.summary.total });
  const saveAvailability = resolvePinEditSaveAvailability({
    fieldErrors,
    photos: photosBase.items,
    isSaving: save.status === "saving",
    hasChanges: hasUnsavedChanges,
  });

  const canRemoveTagEntry = (tag: { createdByUserId: string }) => canRemovePinTag(ctx, tag);

  // 入力の入口（すべて）で保存エラー状態を解除する。手動再試行できない失敗のままでも、
  // 入力を直せば再度保存を押せるようにする（PR #93 T8 と同じ）。保存フロー自身の dispatch では呼ばない。
  // 更新は updater 形式にする（連続した操作で先の更新を失わない。A-7）。
  const updateDraft = (update: (prev: PinEditDraft) => PinEditDraft) => {
    setDraft(update);
    save.resetError();
  };

  const setName = (v: string) => updateDraft((prev) => ({ ...prev, name: v }));
  const setMemo = (v: string) => updateDraft((prev) => ({ ...prev, memo: v }));
  // 権限の無い変更は UI で disabled にするうえ、buildPinUpdateRequest が差分から除く（多層防御）ので弾かない。
  const setVisited = (v: boolean) => updateDraft((prev) => ({ ...prev, visited: v }));
  const setArchived = (v: boolean) => updateDraft((prev) => ({ ...prev, archived: v }));

  const setTagInput = (v: string) => {
    setTagInputState(v);
    setTagError(null);
  };

  const applyAddTag = (label: string) => {
    const result = addTag(draft.tags, label);
    if (!result.ok) {
      setTagError(addTagErrorMessage(result.reason));
      return;
    }
    // 上限・重複の判定結果（error）は現在の下書きで見て、反映は updater で最新の tags に対して行う。
    updateDraft((prev) => {
      const latest = addTag(prev.tags, label);
      return latest.ok ? { ...prev, tags: latest.tags } : prev;
    });
    setTagInputState("");
    setTagError(null);
  };

  const addTagFromInput = () =>
    applyAddTag(resolveTagLabelForAdd(tagInput, tagSuggestionsQuery.candidates));
  const addTagFromSuggestion = (label: string) => applyAddTag(label);

  const canRemoveTag = (label: string) =>
    baseline === null ? true : isDraftTagRemovable(label, baseline, canRemoveTagEntry);

  const removeTag = (label: string) => {
    // UI でも出さないが、多層防御として権限の無いタグは外さない。
    if (!canRemoveTag(label)) return;
    updateDraft((prev) => ({ ...prev, tags: removeTagFrom(prev.tags, label) }));
  };

  // DELETE 済みの写真は表示から外す（サーバーに既に無いので、印を外すと通常の写真に見えてしまう）。
  const visiblePhotos = excludeDeletedPhotos({
    photos: detail.photos,
    photoCount: detail.photoCount,
    deletedPhotoIds,
  });
  const existingPhotos: PinEditExistingPhoto[] = visiblePhotos.photos.map((photo) => ({
    photo,
    markedForDeletion: draft.photoIdsToDelete.includes(photo.id),
    deletable: canDeletePinPhoto(ctx, photo),
  }));

  const togglePhotoDeletion = (photoId: string) => {
    const target = existingPhotos.find((entry) => entry.photo.id === photoId);
    // 権限の無い写真には印を付けない。印を外すのは常に許す。
    if (target === undefined || (!target.deletable && !target.markedForDeletion)) return;
    updateDraft((prev) => ({
      ...prev,
      photoIdsToDelete: toggleDeletionMark(prev.photoIdsToDelete, photoId),
    }));
  };

  const newPhotos: UsePinPhotosResult = {
    ...photosBase,
    addPhotos: async (source) => {
      await photosBase.addPhotos(source);
      save.resetError();
    },
    removePhoto: (localId) => {
      photosBase.removePhoto(localId);
      save.resetError();
    },
    retryPhoto: (localId) => {
      photosBase.retryPhoto(localId);
      save.resetError();
    },
  };

  const submit = () => {
    if (baseline === null || permissions === null || !saveAvailability.canSave) return;
    // このタイミングの内容を同期的にスナップショットする（自動再試行でも同じ内容を送る。PR #93 T12）。
    save.save({
      request: buildPinUpdateRequest({
        baseline,
        draft,
        permissions,
        canRemoveTag: canRemoveTagEntry,
      }),
      photoIdsToDelete: [...draft.photoIdsToDelete],
    });
  };

  return {
    detail: { ...detail, photoCount: visiblePhotos.photoCount },
    baseline,
    draft,
    permissions,
    setName,
    setMemo,
    setVisited,
    setArchived,
    tagInput,
    setTagInput,
    tagError,
    tagSuggestions,
    addTagFromInput,
    addTagFromSuggestion,
    removeTag,
    canRemoveTag,
    existingPhotos,
    togglePhotoDeletion,
    newPhotos,
    fieldErrors,
    saveAvailability,
    save,
    submit,
    hasUnsavedChanges,
  };
}

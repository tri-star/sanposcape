import { useState } from "react";

import { usePinDetail, type UsePinDetailResult } from "@/features/sanpo-map/pin/hooks/usePinDetail";
import {
  usePinEditSave,
  type UsePinEditSaveResult,
} from "@/features/sanpo-map/pin/hooks/usePinEditSave";
import { usePinEditSanpoMap } from "@/features/sanpo-map/pin/hooks/usePinEditSanpoMap";
import {
  usePinEditTags,
  type UsePinEditTagsResult,
} from "@/features/sanpo-map/pin/hooks/usePinEditTags";
import { usePinPhotos, type UsePinPhotosResult } from "@/features/sanpo-map/pin/hooks/usePinPhotos";
import { useSanpoMaps } from "@/features/sanpo-map/map/hooks/useSanpoMaps";
import {
  buildPinUpdateRequest,
  createPinEditBaseline,
  hasUnsavedPinEdit,
  initialPinEditDraft,
  resolvePinEditSaveAvailability,
  togglePhotoDeletion as toggleDeletionMark,
  type PinEditBaseline,
  type PinEditDraft,
  type PinEditSaveAvailability,
} from "@/features/sanpo-map/pin/lib/pinEditDraft";
import { resolveMovedSanpoMapName } from "@/features/sanpo-map/pin/lib/pinEditSanpoMap";
import {
  addDeletedPhotoId,
  canConfirmPinEditBaseline,
  excludeDeletedPhotos,
  rebaseBaselineAfterUpdate,
  rebaseDraftAfterPhotoDeleted,
} from "@/features/sanpo-map/pin/lib/pinEditSync";
import {
  validatePinDraftFields,
  type PinDraftFieldErrors,
} from "@/features/sanpo-map/pin/lib/pinDraftValidation";
import {
  canDeletePinPhoto,
  canRemovePinTag,
  resolvePinPermissions,
  resolvePinRole,
  type PinPermissionContext,
  type PinPermissions,
} from "@/features/sanpo-map/pin/lib/pinPermissions";
import type { SanpoMapChoicesState } from "@/features/sanpo-map/pin/lib/sanpoMapChoices";
import type { SanpoMapSelection } from "@/features/sanpo-map/pin/types";
import type { PinPhoto } from "@/features/sanpo-map/shared/types";

export type PinEditSavedResult = {
  /** 編集を開いた時点の地図から移したなら移動先の地図名。移していなければ null。 */
  movedToSanpoMapName: string | null;
};

export type UsePinEditOptions = {
  /** ルートで isUuid を通した値。不正なら null。 */
  pinId: string | null;
  isSignedIn: boolean;
  /** ルートが認証ストアから読んで注入する（features/sanpo-map は認証ストアを import できない）。 */
  currentUserId: string | null;
  onSaved: (result: PinEditSavedResult) => void;
  onPickerError: (message: string) => void;
};

export type PinEditExistingPhoto = {
  photo: PinPhoto;
  markedForDeletion: boolean;
  /** 削除の印を付けられるか（権限）。 */
  deletable: boolean;
};

export type UsePinEditResult = UsePinEditTagsResult & {
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
  /**
   * 「地図」欄（SanpoMapSelector にそのまま渡す。SS-175）。地図の表示・送信は `sanpoMaps` と
   * `submit` を使う。`draft.sanpoMapId` は生の選択（一覧に無い地図は下書きごと基準値へ戻される）。
   */
  sanpoMaps: SanpoMapChoicesState & { retry: () => void };
  selectSanpoMap: (selection: SanpoMapSelection) => void;
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
  sanpoMapId: "",
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
  const { baseline, setBaseline, draft, setDraft, originalSanpoMapId } = usePinEditBaseline(detail);
  // この画面で DELETE に成功した写真（既存写真の表示から外す。A-1）。
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<readonly string[]>([]);

  // 権限: 地図の role は GET /sanpo-maps のキャッシュから引く（不明は editor 扱い。ADR-M-017）。
  const sanpoMapsQuery = useSanpoMaps({ enabled: options.isSignedIn });
  // role は基準値の地図で引く。部分保存で移動が済んだ後は詳細キャッシュ（pin）がまだ移動前のままで、
  // 基準値は PATCH の応答で作り直されるため（SS-175）。
  const roleSanpoMapId = baseline?.sanpoMapId ?? pin?.sanpoMapId ?? null;
  const ctx: PinPermissionContext = {
    role: roleSanpoMapId !== null ? resolvePinRole(sanpoMapsQuery.maps, roleSanpoMapId) : null,
    currentUserId: options.currentUserId,
  };
  const permissions = pin !== null ? resolvePinPermissions(ctx, pin) : null;
  const canChangeSanpoMap = permissions?.canChangeSanpoMap ?? false;

  const sanpoMap = usePinEditSanpoMap({
    pinId: options.pinId,
    isSignedIn: options.isSignedIn,
    sanpoMapsQuery,
    canChangeSanpoMap,
    baseline,
    draft,
    setDraft,
  });
  const { effectiveDraft } = sanpoMap;

  const photosBase = usePinPhotos({
    enabled: options.isSignedIn,
    onPickerError: options.onPickerError,
  });

  const save = usePinEditSave({
    pinId: options.pinId,
    photos: photosBase.saveBridge,
    // 移動先は最後に成功した PATCH の応答から求める（ref の受け渡しに頼らない。M3）。
    onSaved: (lastUpdated) =>
      options.onSaved({
        movedToSanpoMapName:
          originalSanpoMapId === null
            ? null
            : resolveMovedSanpoMapName({ originalSanpoMapId, lastUpdated }),
      }),
    onPinUpdated: (updated) => setBaseline(rebaseBaselineAfterUpdate(updated)),
    onPhotoDeleted: (photoId) => {
      setDeletedPhotoIds((prev) => addDeletedPhotoId(prev, photoId));
      setDraft((prev) => rebaseDraftAfterPhotoDeleted(prev, photoId));
    },
  });

  const fieldErrors = validatePinDraftFields(draft);
  const hasUnsavedChanges =
    baseline !== null &&
    hasUnsavedPinEdit({ baseline, draft: effectiveDraft, newPhotoCount: photosBase.summary.total });
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

  // タグ候補は選んでいる地図から取る（移動先の表記に揃う）。
  const tags = usePinEditTags({
    isSignedIn: options.isSignedIn,
    sanpoMapId: sanpoMap.effectiveSanpoMapId ?? pin?.sanpoMapId ?? null,
    baseline,
    draft,
    updateDraft,
    canRemoveTagEntry,
  });

  const setName = (v: string) => updateDraft((prev) => ({ ...prev, name: v }));
  const setMemo = (v: string) => updateDraft((prev) => ({ ...prev, memo: v }));
  // 権限の無い変更は UI で disabled にするうえ、buildPinUpdateRequest が差分から除く（多層防御）ので弾かない。
  const setVisited = (v: boolean) => updateDraft((prev) => ({ ...prev, visited: v }));
  const setArchived = (v: boolean) => updateDraft((prev) => ({ ...prev, archived: v }));

  const selectSanpoMap = (selection: SanpoMapSelection) => {
    // 編集の選択肢はすべて existing。権限が無ければ多層防御として変えない（UI でも disabled）。
    // 移せない地図も同じく変えない（チップは押せない。SS-192）。
    if (selection.kind !== "existing" || !canChangeSanpoMap) return;
    if (sanpoMap.blockedSanpoMapIds.has(selection.sanpoMapId)) return;
    updateDraft((prev) => ({ ...prev, sanpoMapId: selection.sanpoMapId }));
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

  const newPhotos = withSaveErrorReset(photosBase, save.resetError);

  const submit = () => {
    if (baseline === null || permissions === null || !saveAvailability.canSave) return;
    // このタイミングの内容を同期的にスナップショットする（自動再試行でも同じ内容を送る。PR #93 T12）。
    save.save({
      request: buildPinUpdateRequest({
        baseline,
        draft: effectiveDraft,
        permissions,
        canRemoveTag: canRemoveTagEntry,
      }),
      photoIdsToDelete: [...draft.photoIdsToDelete],
    });
  };

  return {
    ...tags,
    detail: { ...detail, photoCount: visiblePhotos.photoCount },
    baseline,
    draft,
    permissions,
    setName,
    setMemo,
    setVisited,
    setArchived,
    sanpoMaps: { ...sanpoMap.choices, retry: sanpoMapsQuery.retry },
    selectSanpoMap,
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

/**
 * 基準値と下書き。詳細が「新しく」取れた時点で1回だけレンダー中に確定する
 * （docs/architecture-guideline.md「1回だけの状態確定」）。詳細を取り直しても入力を消さない。
 * invalidate 済みの古いキャッシュで確定しないよう、再取得が終わるまで待つ（A-2）。
 * 部分保存の後は、PATCH の成功応答で基準値を作り直す（A-1。`onPinUpdated`）。
 */
function usePinEditBaseline(detail: UsePinDetailResult) {
  const [baseline, setBaseline] = useState<PinEditBaseline | null>(null);
  const [draft, setDraft] = useState<PinEditDraft>(EMPTY_DRAFT);
  // 編集を開いた時点の地図（移動のトースト判定用。基準値は部分保存で作り直されるので別に持つ。SS-175）。
  const [originalSanpoMapId, setOriginalSanpoMapId] = useState<string | null>(null);
  if (
    baseline === null &&
    detail.pin !== null &&
    canConfirmPinEditBaseline({
      hasPin: true,
      isFetching: detail.isFetching,
      hasError: detail.errorCode !== null,
    })
  ) {
    const created = createPinEditBaseline(detail.pin);
    setBaseline(created);
    setDraft(initialPinEditDraft(created));
    setOriginalSanpoMapId(created.sanpoMapId);
  }
  return { baseline, setBaseline, draft, setDraft, originalSanpoMapId };
}

/** 新しい写真の操作（追加・削除・再試行）でも保存エラー状態を解除する（入力の入口と同じ扱い）。 */
function withSaveErrorReset(
  photos: UsePinPhotosResult,
  resetError: () => void,
): UsePinPhotosResult {
  return {
    ...photos,
    addPhotos: async (source) => {
      await photos.addPhotos(source);
      resetError();
    },
    removePhoto: (localId) => {
      photos.removePhoto(localId);
      resetError();
    },
    retryPhoto: (localId) => {
      photos.retryPhoto(localId);
      resetError();
    },
  };
}

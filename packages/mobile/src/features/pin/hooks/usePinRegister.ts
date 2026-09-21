import { useCallback, useMemo, useRef, useState } from "react";

import { buildPinCreateRequest } from "@/features/pin/lib/pinCreateRequest";
import type { PinDraftFieldErrors, SaveAvailability } from "@/features/pin/lib/pinDraftValidation";
import {
  hasUnsavedInput,
  resolveSaveAvailability,
  validatePinDraftFields,
} from "@/features/pin/lib/pinDraftValidation";
import { addTag, addTagErrorMessage, removeTag as removeTagFrom } from "@/features/pin/lib/pinTags";
import { resolveSanpoMapChoices } from "@/features/pin/lib/sanpoMapChoices";
import type { SanpoMapChoicesState } from "@/features/pin/lib/sanpoMapChoices";
import { useSanpoMaps } from "@/features/pin/hooks/useSanpoMaps";
import { usePinPhotos } from "@/features/pin/hooks/usePinPhotos";
import type { UsePinPhotosResult } from "@/features/pin/hooks/usePinPhotos";
import { usePinSave } from "@/features/pin/hooks/usePinSave";
import type { UsePinSaveResult } from "@/features/pin/hooks/usePinSave";
import type { PinDraft, SanpoMapSelection, SavedPin } from "@/features/pin/types";
import { randomUuidV4 } from "@/lib/uuid";
import type { GeoCoordinates } from "@/services/location/types";

export type UsePinRegisterOptions = {
  location: GeoCoordinates;
  clientWalkId: string | null;
  isSignedIn: boolean;
  onSaved: (pin: SavedPin) => void;
  onPickerError: (message: string) => void;
};

export type UsePinRegisterResult = {
  draft: PinDraft;
  setName: (v: string) => void;
  setMemo: (v: string) => void;
  tagInput: string;
  setTagInput: (v: string) => void;
  tagError: string | null;
  addTagFromInput: () => void;
  removeTag: (label: string) => void;
  selectSanpoMap: (selection: SanpoMapSelection) => void;
  sanpoMaps: SanpoMapChoicesState & { retry: () => void };
  photos: UsePinPhotosResult;
  fieldErrors: PinDraftFieldErrors;
  saveAvailability: SaveAvailability;
  save: UsePinSaveResult;
  submit: () => void;
  hasUnsavedInput: boolean;
};

/**
 * ピン登録画面が必要とするものを1つに束ねる合成 hook。
 * 判定・整形はすべて `lib/` に委ね、この hook は状態の保持と配線だけを行う
 * （`useActiveWalk` と同じ設計方針）。
 */
export function usePinRegister(options: UsePinRegisterOptions): UsePinRegisterResult {
  // 画面を開いた時点で1回だけ採番する（保存の冪等キー）。
  const clientPinIdRef = useRef<string>(randomUuidV4());

  const [name, setNameState] = useState("");
  const [memo, setMemoState] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagError, setTagError] = useState<string | null>(null);
  const [sanpoMapSelection, setSanpoMapSelection] = useState<SanpoMapSelection>({
    kind: "default",
  });

  const draft: PinDraft = { name, memo, tags, sanpoMapSelection };
  // 保存中に入力が変わっても作成内容が揺れないよう、保存開始時点（submit() 呼び出し時）の
  // draft を ref で固定する（PR #93 T12）。以前は毎レンダーで `draftRef.current = draft` を
  // 上書きしていたため、コメントの意図（「保存開始時点で固定」）と実装が一致していなかった
  // （保存を押した後に地図やタグを変更すると送信内容に混ざりうるバグ）。ここでは
  // `submit()` の中でだけ代入し、以後の自動再試行（`buildCreateRequest` が都度 `draftRef.current`
  // を読む）でも同じ値を使い続ける。
  const draftRef = useRef(draft);

  const sanpoMapsQuery = useSanpoMaps({ enabled: options.isSignedIn });
  const sanpoMapsState = useMemo(
    () =>
      resolveSanpoMapChoices({
        status: sanpoMapsQuery.status,
        maps: sanpoMapsQuery.maps,
        selection: sanpoMapSelection,
      }),
    [sanpoMapsQuery.status, sanpoMapsQuery.maps, sanpoMapSelection],
  );

  const photosBase = usePinPhotos({
    enabled: options.isSignedIn,
    onPickerError: options.onPickerError,
  });

  const buildCreateRequest = useCallback(
    (photoUploadIds: readonly string[]) =>
      buildPinCreateRequest({
        clientPinId: clientPinIdRef.current,
        draft: draftRef.current,
        location: options.location,
        photoUploadIds,
        clientWalkId: options.clientWalkId,
      }),
    [options.location, options.clientWalkId],
  );

  const save = usePinSave({
    photos: photosBase.saveBridge,
    buildCreateRequest,
    onSaved: options.onSaved,
  });

  // どちらも文字数チェック・配列走査のみで軽量なため useMemo せず毎レンダー計算する。
  const fieldErrors = validatePinDraftFields(draft);
  const saveAvailability = resolveSaveAvailability({
    fieldErrors,
    photos: photosBase.items,
    isSaving: save.status === "saving",
  });

  // PR #93 T8: 写真・地図・入力のいずれかが変わったら保存エラー状態をリセットする
  // （`photo_not_ready` / `sanpo_map_not_found` のような手動再試行不可のエラーコードのままだと、
  // 案内どおり直しても保存ボタンが無効のまま戻らないバグがあった）。ユーザー操作の入口
  // （setName/setMemo/タグ追加削除・地図の選び直し・写真の追加/削除/再試行）でだけ呼ぶことで、
  // 保存フロー自身が写真を紐付ける進行中の dispatch（連鎖的に photos.items が変わる）では
  // 誤って直後にエラーを消してしまわないようにする。
  //
  // React Compiler（app.json の experiments.reactCompiler）がビルド時に自動メモ化するため、
  // 手動の useCallback は付けない（依存配列の陳腐化・compiler との不整合警告を避ける）。
  const setName = (v: string) => {
    setNameState(v);
    save.resetError();
  };

  const setMemo = (v: string) => {
    setMemoState(v);
    save.resetError();
  };

  const addTagFromInput = () => {
    const result = addTag(tags, tagInput);
    if (!result.ok) {
      setTagError(addTagErrorMessage(result.reason));
      return;
    }
    setTags(result.tags);
    setTagInput("");
    setTagError(null);
    save.resetError();
  };

  const removeTag = (label: string) => {
    setTags((prev) => removeTagFrom(prev, label));
    save.resetError();
  };

  const selectSanpoMap = (selection: SanpoMapSelection) => {
    setSanpoMapSelection(selection);
    save.resetError();
  };

  const photos: UsePinPhotosResult = {
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
    if (!saveAvailability.canSave) return;
    // このタイミングの draft を同期的にスナップショット固定する（PR #93 T12）。
    draftRef.current = draft;
    save.save();
  };

  return {
    draft,
    setName,
    setMemo,
    tagInput,
    setTagInput,
    tagError,
    addTagFromInput,
    removeTag,
    selectSanpoMap,
    sanpoMaps: { ...sanpoMapsState, retry: sanpoMapsQuery.retry },
    photos,
    fieldErrors,
    saveAvailability,
    save,
    submit,
    hasUnsavedInput: hasUnsavedInput(draft, photos.summary.total),
  };
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";

import type { PinUpdate } from "@/api/generated/model";
import { getApiBaseUrl } from "@/config/env";
import { deletePinPhoto, updatePin } from "@/features/pin/api/pinEditApi";
import { addPinPhotos } from "@/features/pin/api/pinApi";
import type { UsePinPhotosResult } from "@/features/pin/hooks/usePinPhotos";
import {
  isPinEditError,
  isRetriablePinEditError,
  toPinEditErrorCode,
  type PinEditErrorCode,
  type PinEditStage,
} from "@/features/pin/lib/pinEditError";
import { runPinEditSave, type PinEditSaveProgress } from "@/features/pin/lib/pinEditSaveRunner";
import {
  PINS_QUERY_ROOT,
  SANPO_MAPS_QUERY_KEY,
  pinDetailQueryKey,
  pinPhotosQueryKey,
} from "@/features/pin/lib/pinQueryKeys";
import { runAttachPhotosToPin } from "@/features/pin/lib/pinSaveRunner";

/** 自動再試行の最大回数（初回 + この回数まで）。`usePinSave` と同じ値。 */
const MAX_RETRY_COUNT = 2;
const RETRY_DELAY_BASE_MS = 1000;
const RETRY_DELAY_MAX_MS = 8000;

export type PinEditSaveSnapshot = {
  /** submit 時点で固定した差分。 */
  request: PinUpdate;
  /** submit 時点で固定した削除対象。 */
  photoIdsToDelete: string[];
};

export type UsePinEditSaveResult = {
  status: "idle" | "saving" | "saved" | "error";
  progress: PinEditSaveProgress | null;
  errorCode: PinEditErrorCode | null;
  errorStage: PinEditStage | null;
  /** 1つ以上の段が成功した（部分的に保存済み）。破棄ダイアログの文言に使う。 */
  partiallySaved: boolean;
  save: (snapshot: PinEditSaveSnapshot) => void;
  /** エラー状態を解除する（入力が変わったとき。エラーでなければ no-op）。 */
  resetError: () => void;
};

/**
 * 「変更を保存」の mutation（`usePinSave` の編集版）。手順は `runPinEditSave`（lib）に委ね、
 * ここは配線とキャッシュの更新だけを行う。
 */
export function usePinEditSave(options: {
  pinId: string | null;
  photos: UsePinPhotosResult["saveBridge"];
  onSaved: () => void;
}): UsePinEditSaveResult {
  const { pinId, photos } = options;
  const queryClient = useQueryClient();
  const onSavedRef = useRef(options.onSaved);
  onSavedRef.current = options.onSaved;

  const [progress, setProgress] = useState<PinEditSaveProgress | null>(null);
  const [partiallySaved, setPartiallySaved] = useState(false);
  const partiallySavedRef = useRef(false);
  // 自動再試行でも同じスナップショットを使う（途中で入力が変わっても送る内容を変えない）。
  const snapshotRef = useRef<PinEditSaveSnapshot | null>(null);
  // この画面で DELETE に成功した写真。画面の寿命の間だけ持つ（成功後も画面を閉じるのでクリアしない）。
  const deletedPhotoIdsRef = useRef(new Set<string>());

  const markPartiallySaved = useCallback(() => {
    partiallySavedRef.current = true;
    setPartiallySaved(true);
  }, []);

  const mutation = useMutation({
    mutationFn: async () => {
      const snapshot = snapshotRef.current;
      if (pinId === null || snapshot === null) {
        throw new Error("usePinEditSave: save() called without a pin or snapshot");
      }
      setProgress(null);
      await runPinEditSave({
        pinId,
        request: snapshot.request,
        photoIdsToDelete: snapshot.photoIdsToDelete,
        isPhotoDeleted: (id) => deletedPhotoIdsRef.current.has(id),
        markPhotoDeleted: (id) => {
          deletedPhotoIdsRef.current.add(id);
          markPartiallySaved();
        },
        updatePin: async (id, request) => {
          const result = await updatePin(id, request, { apiBaseUrl: getApiBaseUrl() });
          markPartiallySaved();
          return result;
        },
        deletePinPhoto,
        attachPhotos: async (onProgress) => {
          await runAttachPhotosToPin({
            pinId,
            getItems: photos.getItems,
            dispatch: (action) => {
              if (action.type === "attached" && action.uploadIds.length > 0) {
                markPartiallySaved();
              }
              photos.dispatch(action);
            },
            addPinPhotos,
            transferPhoto: photos.transferPhoto,
            awaitBackgroundIdle: photos.pauseAndAwaitIdle,
            onProgress: (p) => {
              if (p.step === "sending_photos") onProgress(p);
            },
          });
        },
        onProgress: setProgress,
      });
    },
    onSuccess: () => {
      if (pinId === null) return;
      // 写真ページ（infinite）は削除・追加で並びが変わるため、先頭から読み直す。
      void queryClient.resetQueries({ queryKey: pinPhotosQueryKey(pinId) });
      // 詳細・地図のマーカー・地図詳細の一覧（名前・タグ・代表写真）・タグ候補。
      // 地図一覧の pin_count は変わらないので触らない。
      void queryClient.invalidateQueries({ queryKey: PINS_QUERY_ROOT });
      onSavedRef.current();
    },
    onError: (error) => {
      if (pinId === null) return;
      const code = toPinEditErrorCode(error);
      if (code === "pin_not_found") {
        // 戻った詳細画面を not-found にする。
        void queryClient.invalidateQueries({ queryKey: pinDetailQueryKey(pinId) });
      } else if (code === "forbidden") {
        // role や作成者が変わった可能性がある。
        void queryClient.invalidateQueries({ queryKey: SANPO_MAPS_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: pinDetailQueryKey(pinId) });
      }
    },
    onSettled: () => {
      photos.resume();
    },
    retry: (failureCount, error) =>
      failureCount < MAX_RETRY_COUNT && isRetriablePinEditError(toPinEditErrorCode(error)),
    retryDelay: (attemptIndex) =>
      Math.min(RETRY_DELAY_BASE_MS * 2 ** attemptIndex, RETRY_DELAY_MAX_MS),
  });

  // 保存の途中で失敗したまま画面を離れても、詳細と一覧が古いままにならないようにする。
  // 失敗の直後には invalidate しない（編集中に詳細を取り直すと既存写真と追加写真が二重に見えるため）。
  useEffect(
    () => () => {
      if (partiallySavedRef.current) {
        void queryClient.invalidateQueries({ queryKey: PINS_QUERY_ROOT });
      }
    },
    [queryClient],
  );

  const { mutate, reset, isError } = mutation;
  const save = useCallback(
    (snapshot: PinEditSaveSnapshot) => {
      snapshotRef.current = snapshot;
      mutate();
    },
    [mutate],
  );
  const resetError = useCallback(() => {
    if (isError) reset();
  }, [isError, reset]);

  const status: UsePinEditSaveResult["status"] = mutation.isSuccess
    ? "saved"
    : mutation.isPending
      ? "saving"
      : mutation.isError
        ? "error"
        : "idle";

  return {
    status,
    progress,
    errorCode: mutation.isError ? toPinEditErrorCode(mutation.error) : null,
    errorStage: mutation.isError
      ? isPinEditError(mutation.error)
        ? mutation.error.stage
        : "update"
      : null,
    partiallySaved,
    save,
    resetError,
  };
}

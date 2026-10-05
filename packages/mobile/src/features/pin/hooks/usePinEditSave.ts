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
import {
  INITIAL_PIN_EDIT_UPDATE_RECORD,
  recordPinEditUpdate,
  shouldInvalidateSanpoMapsAfterSave,
} from "@/features/pin/lib/pinEditSanpoMap";
import { runPinEditSave, type PinEditSaveProgress } from "@/features/pin/lib/pinEditSaveRunner";
import {
  PINS_QUERY_ROOT,
  SANPO_MAPS_QUERY_KEY,
  pinDetailQueryKey,
  pinPhotosQueryKey,
} from "@/features/pin/lib/pinQueryKeys";
import { runAttachPhotosToPin } from "@/features/pin/lib/pinSaveRunner";
import type { PinDetail } from "@/features/pin/types";

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
  /**
   * 保存の成功。`lastUpdated` はこの画面で最後に成功した PATCH の応答（部分保存の分を含む。
   * PATCH が一度も成功していなければ null）。移動のトースト判定に使う（SS-175）。
   */
  onSaved: (lastUpdated: PinDetail | null) => void;
  /** PATCH の成功応答。編集画面の基準値を作り直す（部分保存後も差分が正しく出るように。A-1）。 */
  onPinUpdated: (updated: PinDetail) => void;
  /** DELETE に成功した写真。下書きの印と既存写真の表示から外す（A-1）。 */
  onPhotoDeleted: (photoId: string) => void;
}): UsePinEditSaveResult {
  const { pinId, photos } = options;
  const queryClient = useQueryClient();
  const onSavedRef = useRef(options.onSaved);
  onSavedRef.current = options.onSaved;
  const onPinUpdatedRef = useRef(options.onPinUpdated);
  onPinUpdatedRef.current = options.onPinUpdated;
  const onPhotoDeletedRef = useRef(options.onPhotoDeleted);
  onPhotoDeletedRef.current = options.onPhotoDeleted;
  // 同一フレーム内の連打で保存が2本走らないよう、同期的に立てるラッチ（`usePinDelete` と同じ）。
  // `status` は描画を待つため、ボタンの disabled だけでは取りこぼす。
  const submittingRef = useRef(false);

  const [progress, setProgress] = useState<PinEditSaveProgress | null>(null);
  const [partiallySaved, setPartiallySaved] = useState(false);
  // ref と state の二重持ち: ref はアンマウント時の cleanup から最新値を読むため、state は描画
  // （破棄ダイアログの文言）に使うため。cleanup はクロージャが古いので state は読めない。
  const partiallySavedRef = useRef(false);
  // 自動再試行でも同じスナップショットを使う（途中で入力が変わっても送る内容を変えない）。
  const snapshotRef = useRef<PinEditSaveSnapshot | null>(null);
  // この画面で DELETE に成功した写真。画面の寿命の間だけ持つ（成功後も画面を閉じるのでクリアしない）。
  const deletedPhotoIdsRef = useRef(new Set<string>());
  // この保存（save() 1回分）で PATCH に成功したか。自動再試行で同じ PATCH を再送しない。
  const updatedRef = useRef(false);
  // PATCH の成功応答。成功時に詳細キャッシュへ先に反映する（A-5）。
  const updatedPinRef = useRef<PinDetail | null>(null);
  // この画面で成功した PATCH の記録（SS-175 M3）。画面の寿命の間持つ＝save() ごとに戻さない。
  // 地図一覧を取り直す判定と、onSaved に渡す最後の応答の両方をここから出す（二重管理しない）。
  const updateRecordRef = useRef(INITIAL_PIN_EDIT_UPDATE_RECORD);

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
          onPhotoDeletedRef.current(id);
        },
        isUpdated: () => updatedRef.current,
        onUpdated: (updated) => {
          updatedRef.current = true;
          updatedPinRef.current = updated;
          updateRecordRef.current = recordPinEditUpdate(updateRecordRef.current, {
            request: snapshot.request,
            updated,
          });
          markPartiallySaved();
          onPinUpdatedRef.current(updated);
        },
        updatePin: (id, request) => updatePin(id, request, { apiBaseUrl: getApiBaseUrl() }),
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
      // 成功で画面を離れる。アンマウント時の invalidate（途中失敗用）と重複させない。
      partiallySavedRef.current = false;
      // 詳細に戻った直後に旧データと「更新しました」が同時に出ないよう、PATCH の応答で先に差し替える。
      // 写真の段の結果は含まないが、直後の invalidate で取り直される。
      if (updatedPinRef.current !== null) {
        queryClient.setQueryData(pinDetailQueryKey(pinId), updatedPinRef.current);
      }
      // 写真ページ（infinite）は削除・追加で並びが変わるため、先頭から読み直す。
      void queryClient.resetQueries({ queryKey: pinPhotosQueryKey(pinId) });
      // 詳細・地図のマーカー・地図詳細の一覧（名前・タグ・代表写真）・タグ候補。
      // 地図を移したときだけ地図一覧も取り直す（SS-175）。
      void queryClient.invalidateQueries({ queryKey: PINS_QUERY_ROOT });
      // 移動元・移動先の pin_count と、並び順（backend は移動先の mark_used() を呼ぶ。ルート ADR-009 決定33）が変わる。
      if (shouldInvalidateSanpoMapsAfterSave(updateRecordRef.current)) {
        void queryClient.invalidateQueries({ queryKey: SANPO_MAPS_QUERY_KEY });
      }
      onSavedRef.current(updateRecordRef.current.lastUpdated);
    },
    onError: (error) => {
      if (pinId === null) return;
      const code = toPinEditErrorCode(error);
      if (code === "pin_not_found") {
        // 戻った詳細画面を not-found にする。
        void queryClient.invalidateQueries({ queryKey: pinDetailQueryKey(pinId) });
      } else if (code === "sanpo_map_not_found") {
        // 消えた地図を選択肢から外す（有効な選択は今の地図に戻る）。
        void queryClient.invalidateQueries({ queryKey: SANPO_MAPS_QUERY_KEY });
      } else if (code === "forbidden") {
        // role や作成者が変わった可能性がある。
        void queryClient.invalidateQueries({ queryKey: SANPO_MAPS_QUERY_KEY });
        void queryClient.invalidateQueries({ queryKey: pinDetailQueryKey(pinId) });
      }
    },
    onSettled: () => {
      submittingRef.current = false;
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
        if (shouldInvalidateSanpoMapsAfterSave(updateRecordRef.current)) {
          void queryClient.invalidateQueries({ queryKey: SANPO_MAPS_QUERY_KEY });
        }
      }
    },
    [queryClient],
  );

  const { mutate, reset, isError } = mutation;
  const save = useCallback(
    (snapshot: PinEditSaveSnapshot) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      snapshotRef.current = snapshot;
      updatedRef.current = false;
      updatedPinRef.current = null;
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

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";

import type { PinCreate } from "@/api/generated/model";
import { addPinPhotos, createPin } from "@/features/pin/api/pinApi";
import type { UsePinPhotosResult } from "@/features/pin/hooks/usePinPhotos";
import {
  isPinSaveError,
  isRetriablePinSaveError,
  toPinSaveErrorCode,
} from "@/features/pin/lib/pinSaveError";
import type { PinSaveErrorCode, PinSaveStage } from "@/features/pin/lib/pinSaveError";
import { runPinSave } from "@/features/pin/lib/pinSaveRunner";
import { SANPO_MAPS_QUERY_KEY } from "@/features/pin/hooks/useSanpoMaps";
import type { PinSaveProgress, PinSaveStatus, SavedPin } from "@/features/pin/types";

/** ピン一覧の queryKey（BK-4 で使う想定。今は invalidate 先としてだけ存在する）。 */
const PINS_QUERY_KEY = ["pins"] as const;

/** 自動再試行の最大回数（初回 + この回数まで）。`useWalkSave` と同じ値。 */
const MAX_RETRY_COUNT = 2;
const RETRY_DELAY_BASE_MS = 1000;
const RETRY_DELAY_MAX_MS = 8000;

export type UsePinSaveResult = {
  status: PinSaveStatus;
  progress: PinSaveProgress | null;
  errorCode: PinSaveErrorCode | null;
  errorStage: PinSaveStage | null;
  /** 作成段階が成功していればピン ID（写真の送信途中で失敗しても入る）。再開と離脱時の文言に使う。 */
  savedPinId: string | null;
  save: () => void;
};

export function usePinSave(options: {
  photos: UsePinPhotosResult["saveBridge"];
  buildCreateRequest: (photoUploadIds: readonly string[]) => PinCreate | null;
  onSaved: (pin: SavedPin) => void;
}): UsePinSaveResult {
  const [savedPinId, setSavedPinIdState] = useState<string | null>(null);
  const savedPinIdRef = useRef<string | null>(null);
  const [progress, setProgress] = useState<PinSaveProgress | null>(null);
  const queryClient = useQueryClient();

  const setSavedPinId = useCallback((pinId: string) => {
    savedPinIdRef.current = pinId;
    setSavedPinIdState(pinId);
  }, []);

  const mutation = useMutation({
    mutationFn: async () => {
      setProgress(null);
      const result = await runPinSave({
        getItems: options.photos.getItems,
        dispatch: options.photos.dispatch,
        getSavedPinId: () => savedPinIdRef.current,
        setSavedPinId,
        buildCreateRequest: options.buildCreateRequest,
        createPin,
        addPinPhotos,
        transferPhoto: options.photos.transferPhoto,
        awaitBackgroundIdle: options.photos.pauseAndAwaitIdle,
        onProgress: setProgress,
      });
      return result;
    },
    onSuccess: (pin) => {
      void queryClient.invalidateQueries({ queryKey: SANPO_MAPS_QUERY_KEY });
      void queryClient.invalidateQueries({ queryKey: PINS_QUERY_KEY });
      options.onSaved(pin);
    },
    onSettled: () => {
      options.photos.resume();
    },
    retry: (failureCount, error) =>
      failureCount < MAX_RETRY_COUNT && isRetriablePinSaveError(toPinSaveErrorCode(error)),
    retryDelay: (attemptIndex) =>
      Math.min(RETRY_DELAY_BASE_MS * 2 ** attemptIndex, RETRY_DELAY_MAX_MS),
  });

  const { mutate } = mutation;
  const save = useCallback(() => {
    mutate();
  }, [mutate]);

  const status: PinSaveStatus = mutation.isSuccess
    ? "saved"
    : mutation.isPending
      ? "saving"
      : mutation.isError
        ? "error"
        : "idle";

  const errorCode = mutation.isError ? toPinSaveErrorCode(mutation.error) : null;
  const errorStage = mutation.isError
    ? isPinSaveError(mutation.error)
      ? mutation.error.stage
      : savedPinIdRef.current !== null
        ? "add_photos"
        : "create"
    : null;

  return {
    status,
    progress,
    errorCode,
    errorStage,
    savedPinId,
    save,
  };
}

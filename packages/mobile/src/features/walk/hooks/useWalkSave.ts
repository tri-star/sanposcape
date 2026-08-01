import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { ApiError } from "@/api/apiError";
import { saveWalk } from "@/features/walk/api/walkApi";
import { buildWalkCreateRequest } from "@/features/walk/lib/walkCreateRequest";
import { isRetriableWalkSaveError, toWalkSaveErrorCode } from "@/features/walk/lib/walkSaveError";
import type { WalkSaveErrorCode } from "@/features/walk/lib/walkSaveError";
import { useFinishedWalkStore } from "@/features/walk/store/useFinishedWalkStore";
import type { FinishedWalk, WalkSaveStatus } from "@/features/walk/types";

export type UseWalkSaveResult = {
  status: WalkSaveStatus;
  errorCode: WalkSaveErrorCode | null;
  /** 手動再試行。error のときだけ意味を持つ。 */
  retry: () => void;
};

/** 自動再試行の最大回数（初回 + この回数まで）。 */
const MAX_RETRY_COUNT = 2;
const RETRY_DELAY_BASE_MS = 1000;
const RETRY_DELAY_MAX_MS = 8000;

/**
 * 散歩記録の保存（POST /walks）を実行し、状態と再試行手段を提供する hook。
 * `finishedWalk` が渡され、まだ保存済みでなければ1回だけ自動発火する
 * （`useRef` に発火済みの `clientWalkId` を記録して StrictMode の二重実行を防ぐ。
 * 万一二重発火しても `client_walk_id` の冪等性で履歴は増えない）。
 *
 * `buildWalkCreateRequest` が null を返すケース（保存不能）は `ApiError(422)` を投げて
 * ネットワークに出さずに即エラーにする（既存の分類関数をそのまま使えるため）。
 *
 * 401 は `customFetch` 側で refresh → 1回だけ再送済みのため、ここでは再試行しない
 * （`isRetriableWalkSaveError` が false を返す）。
 */
export function useWalkSave(finishedWalk: FinishedWalk | null): UseWalkSaveResult {
  const saved = useFinishedWalkStore((state) => state.saved);
  const markSaved = useFinishedWalkStore((state) => state.markSaved);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (draft: FinishedWalk) => {
      const request = buildWalkCreateRequest(draft);
      if (request === null) {
        throw new ApiError(422);
      }
      return saveWalk(request);
    },
    onSuccess: (walk) => {
      markSaved(walk.id);
      void queryClient.invalidateQueries({ queryKey: ["walks"] });
    },
    retry: (failureCount, error) =>
      failureCount < MAX_RETRY_COUNT && isRetriableWalkSaveError(toWalkSaveErrorCode(error)),
    retryDelay: (attemptIndex) =>
      Math.min(RETRY_DELAY_BASE_MS * 2 ** attemptIndex, RETRY_DELAY_MAX_MS),
  });

  const { mutate } = mutation;
  const firedClientWalkIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (finishedWalk === null || saved) return;
    if (firedClientWalkIdRef.current === finishedWalk.clientWalkId) return;
    firedClientWalkIdRef.current = finishedWalk.clientWalkId;
    mutate(finishedWalk);
  }, [finishedWalk, saved, mutate]);

  const retry = () => {
    if (finishedWalk === null) return;
    mutate(finishedWalk);
  };

  const status: WalkSaveStatus = saved
    ? "saved"
    : mutation.isPending
      ? "saving"
      : mutation.isError
        ? "error"
        : "idle";

  return {
    status,
    errorCode: mutation.isError ? toWalkSaveErrorCode(mutation.error) : null,
    retry,
  };
}
